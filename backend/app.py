# -*- coding: utf-8 -*-
"""
FastAPI Backend for Persian Visual Question Answering (VQA) System.
Complies with Proposal specifications:
1. Multipart/form-data upload for Image and Persian Question.
2. Pydantic validation & OpenAPI/Swagger documentation.
3. SQLite database persistence for sessions, queries, latencies and ratings.
4. Seamless integration with Google Colab AI Service (Qwen2-VL) & local fallback engine.
5. Endpoints for image analysis, follow-up questions, history, rating, and stats.
"""
from __future__ import annotations

import os
import shutil
import time
from typing import List, Optional
from contextlib import asynccontextmanager

from fastapi import (
    FastAPI,
    UploadFile,
    File,
    Form,
    HTTPException,
    Path,
    Request,
    status
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from schemas import (
    AnalyzeResponse,
    ConversationSummary,
    ConversationDetail,
    MessageItem,
    FollowUpRequest,
    RateRequest,
    HealthResponse,
    StatsResponse
)
from database import (
    init_db,
    create_conversation,
    get_conversations,
    get_conversation,
    delete_conversation,
    add_message,
    rate_message,
    get_system_stats
)
from image_utils import (
    validate_image_file,
    process_and_save_image,
    ImageValidationError
)
from text_utils import normalize_persian_text, detect_question_level
from gateway import query_vqa, check_ai_health, AI_SERVICE_URL, AI_MODEL_NAME

UPLOAD_DIR = os.getenv("UPLOAD_DIR", os.path.join(os.path.dirname(__file__), "uploads"))
os.makedirs(UPLOAD_DIR, exist_ok=True)
START_TIME = time.time()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize Database
    init_db()
    yield


app = FastAPI(
    title="سامانه پرسش و پاسخ تصویری به زبان فارسی (Persian VQA API)",
    description="سرویس وب RESTful برای پردازش و پاسخ به پرسش‌های متنی پیرامون تصاویر به زبان فارسی",
    version="1.0.0",
    lifespan=lifespan
)

# CORS Middleware for Frontend React Application
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount uploaded images directory for frontend image previews
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


def get_image_url(request: Request, filename: str) -> str:
    base_url = str(request.base_url).rstrip("/")
    return f"{base_url}/uploads/{filename}"


@app.get("/health", response_model=HealthResponse, tags=["سیستم"])
@app.get("/api/health", response_model=HealthResponse, tags=["سیستم"])
async def health():
    ai_online, model_name = await check_ai_health()
    return HealthResponse(
        status="ok",
        ai_service_url=AI_SERVICE_URL,
        ai_online=ai_online,
        model=model_name,
        device_info="GPU Tesla T4 (Google Colab Pro) / Local Engine"
    )


@app.get("/api/stats", response_model=StatsResponse, tags=["سیستم"])
async def stats():
    data = get_system_stats()
    return StatsResponse(
        total_conversations=data["total_conversations"],
        total_questions=data["total_questions"],
        avg_latency_ms=data["avg_latency_ms"],
        level_distribution=data["level_distribution"],
        confidence_distribution=data["confidence_distribution"]
    )


@app.post("/api/vqa/analyze", response_model=AnalyzeResponse, tags=["پرسش و پاسخ"])
async def analyze_image_and_question(
    request: Request,
    image: UploadFile = File(..., description="فایل تصویر ورودی (JPG, PNG, WEBP)"),
    question: str = Form(..., min_length=1, max_length=4000, description="پرسش متنی کاربر به زبان فارسی"),
    level: Optional[int] = Form(None, ge=1, le=4, description="سطح پرسش اختیاری (1 تا 4)")
):
    """
    دریافت هم‌زمان تصویر و پرسش متنی کاربر از طریق Multipart/form-data،
    اعتبارسنجی تصویر، نرمال‌سازی متن، ارسال به مدل بینایی-زبانی و ذخیره در سوابق.
    """
    file_bytes = await image.read()
    file_size = len(file_bytes)

    # 1. Image Validation
    try:
        validate_image_file(image.filename or "image.jpg", image.content_type, file_size)
    except ImageValidationError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))

    # 2. Process and save image with max dimensions 1024x980
    try:
        saved_filename, w, h, _ = process_and_save_image(file_bytes, image.filename or "image.jpg", UPLOAD_DIR)
    except ImageValidationError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))

    saved_path = os.path.join(UPLOAD_DIR, saved_filename)
    img_url = get_image_url(request, saved_filename)

    # 3. Create Conversation Session
    title = question.strip()[:40] + ("..." if len(question.strip()) > 40 else "")
    conv = create_conversation(title=title, image_filename=saved_filename, width=w, height=h)
    conv_id = conv["id"]

    # 4. Save User Message
    norm_q = normalize_persian_text(question)
    detected_lvl = level if (level and 1 <= level <= 4) else detect_question_level(norm_q)
    add_message(
        conversation_id=conv_id,
        sender="user",
        content=question,
        level=detected_lvl
    )

    # 5. Query Multimodal AI Model
    vqa_result = await query_vqa(saved_path, question, level=detected_lvl)

    # 6. Save Assistant Response in Database
    assistant_msg = add_message(
        conversation_id=conv_id,
        sender="assistant",
        content=vqa_result["answer"],
        confidence=vqa_result["confidence"],
        evidence=vqa_result["evidence"],
        level=vqa_result["level"],
        latency_ms=vqa_result["latency_ms"],
        status="completed"
    )

    return AnalyzeResponse(
        conversation_id=conv_id,
        message_id=assistant_msg["id"],
        question=question,
        normalized_question=norm_q,
        answer=vqa_result["answer"],
        confidence=vqa_result["confidence"],
        evidence=vqa_result["evidence"],
        level=vqa_result["level"],
        model=vqa_result["model"],
        latency_ms=vqa_result["latency_ms"],
        image_url=img_url,
        status="completed"
    )


@app.get("/api/conversations", response_model=List[ConversationSummary], tags=["گفت‌وگو"])
async def list_conversations(request: Request, limit: int = 50):
    rows = get_conversations(limit=limit)
    res = []
    for r in rows:
        res.append(ConversationSummary(
            id=r["id"],
            title=r["title"],
            image_filename=r["image_filename"],
            image_url=get_image_url(request, r["image_filename"]),
            image_width=r.get("image_width"),
            image_height=r.get("image_height"),
            created_at=r["created_at"],
            updated_at=r["updated_at"],
            message_count=r.get("message_count", 0),
            last_answer=r.get("last_answer")
        ))
    return res


@app.get("/api/conversations/{conv_id}", response_model=ConversationDetail, tags=["گفت‌وگو"])
async def get_conversation_detail(request: Request, conv_id: str = Path(...)):
    conv = get_conversation(conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="گفت‌وگوی مورد نظر یافت نشد.")

    messages = [
        MessageItem(
            id=m["id"],
            conversation_id=m["conversation_id"],
            sender=m["sender"],
            content=m["content"],
            confidence=m.get("confidence"),
            evidence=m.get("evidence"),
            level=m.get("level"),
            latency_ms=m.get("latency_ms", 0.0),
            rating=m.get("rating", 0),
            status=m.get("status", "completed"),
            created_at=m["created_at"]
        ) for m in conv["messages"]
    ]

    return ConversationDetail(
        id=conv["id"],
        title=conv["title"],
        image_filename=conv["image_filename"],
        image_url=get_image_url(request, conv["image_filename"]),
        image_width=conv.get("image_width"),
        image_height=conv.get("image_height"),
        created_at=conv["created_at"],
        updated_at=conv["updated_at"],
        messages=messages
    )


@app.post("/api/conversations/{conv_id}/messages", response_model=AnalyzeResponse, tags=["گفت‌وگو"])
async def ask_followup_question(
    request: Request,
    conv_id: str = Path(...),
    payload: FollowUpRequest = ...
):
    """
    طرح سؤال جدید و پیگیری گفت‌وگو درباره همان تصویر قبلی بدون نیاز به بارگذاری مجدد.
    """
    conv = get_conversation(conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="گفت‌وگوی مورد نظر یافت نشد.")

    saved_path = os.path.join(UPLOAD_DIR, conv["image_filename"])
    if not os.path.exists(saved_path):
        raise HTTPException(status_code=404, detail="فایل تصویر جلسه در سرور موجود نیست.")

    norm_q = normalize_persian_text(payload.question)
    lvl = payload.level if (payload.level and 1 <= payload.level <= 4) else detect_question_level(norm_q)

    # 1. Save user question
    add_message(
        conversation_id=conv_id,
        sender="user",
        content=payload.question,
        level=lvl
    )

    # 2. Run analysis
    vqa_result = await query_vqa(saved_path, payload.question, level=lvl)

    # 3. Save assistant response
    assistant_msg = add_message(
        conversation_id=conv_id,
        sender="assistant",
        content=vqa_result["answer"],
        confidence=vqa_result["confidence"],
        evidence=vqa_result["evidence"],
        level=vqa_result["level"],
        latency_ms=vqa_result["latency_ms"],
        status="completed"
    )

    return AnalyzeResponse(
        conversation_id=conv_id,
        message_id=assistant_msg["id"],
        question=payload.question,
        normalized_question=norm_q,
        answer=vqa_result["answer"],
        confidence=vqa_result["confidence"],
        evidence=vqa_result["evidence"],
        level=vqa_result["level"],
        model=vqa_result["model"],
        latency_ms=vqa_result["latency_ms"],
        image_url=get_image_url(request, conv["image_filename"]),
        status="completed"
    )


@app.delete("/api/conversations/{conv_id}", tags=["گفت‌وگو"])
async def delete_conversation_endpoint(conv_id: str = Path(...)):
    conv = get_conversation(conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="گفت‌وگوی مورد نظر یافت نشد.")

    image_path = os.path.join(UPLOAD_DIR, conv["image_filename"])
    if os.path.exists(image_path):
        try:
            os.remove(image_path)
        except Exception:
            pass

    delete_conversation(conv_id)
    return {"status": "success", "message": "گفت‌وگو و تصویر مربوطه با موفقیت حذف گردید."}


@app.post("/api/messages/{message_id}/rate", tags=["بازخورد"])
async def rate_message_endpoint(message_id: str = Path(...), payload: RateRequest = ...):
    success = rate_message(message_id, payload.rating)
    if not success:
        raise HTTPException(status_code=404, detail="پیام مورد نظر یافت نشد.")
    return {"status": "success", "rating": payload.rating}


# Mount compiled frontend if available for unified demo serving
FRONTEND_DIST = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))
if os.path.exists(FRONTEND_DIST):
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend_dist")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8080, reload=True)
