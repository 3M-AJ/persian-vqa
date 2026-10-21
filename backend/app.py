# -*- coding: utf-8 -*-
"""
FastAPI Backend for Persian Visual Question Answering (VQA) System.
Complies with Proposal specifications:
1. Multipart/form-data upload for Image and Persian Question.
2. Pydantic validation & OpenAPI/Swagger documentation.
3. SQLite database persistence for sessions, queries, latencies and ratings.
4. Seamless integration with the Google Colab Qwen3-VL vision service.
5. Endpoints for image analysis, follow-up questions, history, rating, and stats.
"""
from __future__ import annotations

import os
import time
import hashlib
import secrets
import json
from datetime import datetime, timedelta, timezone
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
    status,
    Depends,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.responses import FileResponse

from schemas import (
    AnalyzeResponse,
    FollowUpRequest,
    RateRequest,
    HealthResponse,
    StatsResponse,
    RegisterRequest, LoginRequest, RenameRequest,
)
from database import (
    init_db,
    create_conversation,
    get_conversations,
    get_conversation,
    delete_conversation,
    add_message,
    rate_message,
    get_system_stats,
    create_user, get_user_by_username, verify_user_password,
    create_session, get_session_user, delete_session, rename_conversation,
    set_conversation_image_b,
    owns_image,
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

def get_image_url(request: Request, filename: str) -> str:
    return f"/api/images/{filename}"


bearer = HTTPBearer(auto_error=False)


def public_user(user: dict) -> dict:
    return {"id": user["id"], "username": user["username"], "displayName": user["display_name"], "level": "رایگان", "credits": 0}


async def current_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)):
    if not credentials:
        raise HTTPException(status_code=401, detail="برای ادامه وارد حساب کاربری شوید.")
    token_hash = hashlib.sha256(credentials.credentials.encode("utf-8")).hexdigest()
    user = get_session_user(token_hash)
    if not user:
        raise HTTPException(status_code=401, detail="نشست شما منقضی شده است؛ دوباره وارد شوید.")
    return user


def issue_session(user: dict) -> dict:
    token = secrets.token_urlsafe(48)
    expires = datetime.now(timezone.utc) + timedelta(days=30)
    create_session(user["id"], hashlib.sha256(token.encode("utf-8")).hexdigest(), expires.isoformat())
    return {"token": token, "user": public_user(user)}


def format_message_pair(rows: list[dict]) -> list[dict]:
    pending_question = None
    out = []
    for row in rows:
        if row["sender"] == "user":
            pending_question = row
            continue
        try:
            meta = json.loads(row.get("metadata_json") or "{}")
        except (TypeError, json.JSONDecodeError):
            meta = {}
        pins = meta.get("pins", [])
        out.append({
            "id": row["id"], "question": pending_question["content"] if pending_question else "",
            "answer": {"answer": row["content"], "confidence": row.get("confidence"), "evidence": row.get("evidence")},
            "pins": [{**pin, "group": f"msg-{row['id']}", "pending": False} for pin in pins], "mode": meta.get("mode", "single"),
            "status": "done", "stage": "done", "level": row.get("level"),
            "latencyMs": row.get("latency_ms", 0),
            "feedback": "like" if row.get("rating") == 1 else "dislike" if row.get("rating") == -1 else None,
            "attempts": 1, "createdAt": row.get("created_at"),
        })
        pending_question = None
    return out


def format_conversation(conv: dict) -> dict:
    return {
        "id": conv["id"], "title": conv["title"],
        "image": {"id": conv["image_filename"], "width": conv.get("image_width"), "height": conv.get("image_height")},
        "images": {"A": {"id": conv["image_filename"], "width": conv.get("image_width"), "height": conv.get("image_height")},
                   "B": {"id": conv["image_b_filename"]} if conv.get("image_b_filename") else None},
        "createdAt": conv["created_at"], "updatedAt": conv["updated_at"],
        "messages": format_message_pair(conv.get("messages", [])),
    }


def pack_list_item(row: dict) -> dict:
    return {"id": row["id"], "title": row["title"], "image": {"id": row["image_filename"]},
            "messageCount": row.get("message_count", 0), "updatedAt": row["updated_at"]}


@app.get("/api/config", tags=["حساب کاربری"])
async def config():
    return {"maxUploadMb": 10, "maxQuestionLen": 4000, "maxAttempts": 1,
            "allowedTypes": ["image/jpeg", "image/png", "image/webp"]}


@app.post("/api/auth/register", tags=["حساب کاربری"])
async def register(payload: RegisterRequest):
    user = create_user(payload.username.strip(), payload.display_name.strip(), payload.password)
    if not user:
        raise HTTPException(status_code=409, detail="این نام کاربری قبلاً ثبت شده است.")
    return issue_session(user)


@app.post("/api/auth/login", tags=["حساب کاربری"])
async def login(payload: LoginRequest):
    user = get_user_by_username(payload.username.strip())
    if not user or not verify_user_password(user, payload.password):
        raise HTTPException(status_code=401, detail="نام کاربری یا گذرواژه درست نیست.")
    return issue_session(user)


@app.get("/api/auth/me", tags=["حساب کاربری"])
async def me(user: dict = Depends(current_user)):
    return {"user": public_user(user)}


@app.post("/api/auth/logout", tags=["حساب کاربری"])
async def logout(credentials: HTTPAuthorizationCredentials | None = Depends(bearer), user: dict = Depends(current_user)):
    delete_session(hashlib.sha256(credentials.credentials.encode("utf-8")).hexdigest())
    return {"status": "success"}


@app.get("/api/images/{filename}", tags=["تصویر"])
async def private_image(filename: str, user: dict = Depends(current_user)):
    if not owns_image(user["id"], filename):
        raise HTTPException(status_code=404, detail="تصویر مورد نظر یافت نشد.")
    path = os.path.join(UPLOAD_DIR, os.path.basename(filename))
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="تصویر مورد نظر یافت نشد.")
    return FileResponse(path)


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
async def stats(user: dict = Depends(current_user)):
    data = get_system_stats(user["id"])
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
    level: Optional[int] = Form(None, ge=1, le=4, description="سطح پرسش اختیاری (1 تا 4)"),
    user: dict = Depends(current_user),
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
    conv = create_conversation(title=title, image_filename=saved_filename, width=w, height=h, owner_id=user["id"])
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


@app.get("/api/conversations", tags=["گفت‌وگو"])
async def list_conversations(limit: int = 50, user: dict = Depends(current_user)):
    rows = get_conversations(limit=limit, owner_id=user["id"])
    return {"items": [pack_list_item(r) for r in rows]}


@app.post("/api/conversations", tags=["گفت‌وگو"])
async def create_conversation_endpoint(image: UploadFile = File(...), user: dict = Depends(current_user)):
    data = await image.read()
    try:
        validate_image_file(image.filename or "image.jpg", image.content_type, len(data))
        filename, width, height, _ = process_and_save_image(data, image.filename or "image.jpg", UPLOAD_DIR)
    except ImageValidationError as err:
        raise HTTPException(status_code=400, detail=str(err))
    conv = create_conversation("گفتگوی جدید", filename, width, height, owner_id=user["id"])
    return {"conversation": format_conversation(conv)}


@app.post("/api/conversations/{conv_id}/image-b", tags=["گفت‌وگو"])
async def add_comparison_image(conv_id: str, image: UploadFile = File(...), user: dict = Depends(current_user)):
    conv = get_conversation(conv_id, owner_id=user["id"])
    if not conv:
        raise HTTPException(status_code=404, detail="گفت‌وگوی مورد نظر یافت نشد.")
    data = await image.read()
    try:
        validate_image_file(image.filename or "image.jpg", image.content_type, len(data))
        filename, _, _, _ = process_and_save_image(data, image.filename or "image.jpg", UPLOAD_DIR)
    except ImageValidationError as err:
        raise HTTPException(status_code=400, detail=str(err))
    old_filename = conv.get("image_b_filename")
    set_conversation_image_b(conv_id, user["id"], filename)
    if old_filename and old_filename != filename:
        old_path = os.path.join(UPLOAD_DIR, old_filename)
        if os.path.isfile(old_path):
            os.remove(old_path)
    updated = get_conversation(conv_id, owner_id=user["id"])
    return {"conversation": format_conversation(updated)}


@app.get("/api/conversations/{conv_id}", tags=["گفت‌وگو"])
async def get_conversation_detail(conv_id: str = Path(...), user: dict = Depends(current_user)):
    conv = get_conversation(conv_id, owner_id=user["id"])
    if not conv:
        raise HTTPException(status_code=404, detail="گفت‌وگوی مورد نظر یافت نشد.")

    return {"conversation": format_conversation({**conv, "messages": conv["messages"]})}


@app.post("/api/conversations/{conv_id}/messages", tags=["گفت‌وگو"])
async def ask_followup_question(
    request: Request,
    conv_id: str = Path(...),
    payload: FollowUpRequest = ...,
    user: dict = Depends(current_user),
):
    """
    طرح سؤال جدید و پیگیری گفت‌وگو درباره همان تصویر قبلی بدون نیاز به بارگذاری مجدد.
    """
    conv = get_conversation(conv_id, owner_id=user["id"])
    if not conv:
        raise HTTPException(status_code=404, detail="گفت‌وگوی مورد نظر یافت نشد.")

    image_b_path = os.path.join(UPLOAD_DIR, conv["image_b_filename"]) if payload.mode == "compare" and conv.get("image_b_filename") else None
    if payload.mode == "compare" and not image_b_path:
        raise HTTPException(status_code=400, detail="برای مقایسه ابتدا تصویر B را بارگذاری کنید.")
    if image_b_path and not os.path.exists(image_b_path):
        raise HTTPException(status_code=404, detail="فایل تصویر B در سرور موجود نیست.")

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
    prompt = payload.question
    if payload.pins:
        locations = []
        for index, pin in enumerate(payload.pins, start=1):
            image = pin.get("image", "A")
            box = pin.get("box") or {}
            if all(k in box for k in ("x1", "y1", "x2", "y2")):
                locations.append(f"ناحیهٔ {index} روی تصویر {image}: مختصات نسبی از چپ و بالا ({box['x1']:.3f}, {box['y1']:.3f}) تا ({box['x2']:.3f}, {box['y2']:.3f})")
            else:
                locations.append(f"نقطهٔ {index} روی تصویر {image}: ({pin.get('cx', 0):.3f}, {pin.get('cy', 0):.3f})")
        prompt += "\n\nتمرکز پرسش روی ناحیه‌های مشخص‌شده در تصویر است. " + "؛ ".join(locations)
    vqa_result = await query_vqa(
        saved_path,
        prompt,
        level=lvl,
        second_image_path=image_b_path,
        regions=payload.pins,
    )

    # 3. Save assistant response
    assistant_msg = add_message(
        conversation_id=conv_id,
        sender="assistant",
        content=vqa_result["answer"],
        confidence=vqa_result["confidence"],
        evidence=vqa_result["evidence"],
        level=vqa_result["level"],
        latency_ms=vqa_result["latency_ms"],
        status="completed",
        metadata_json=json.dumps({"pins": payload.pins, "mode": payload.mode}, ensure_ascii=False)
    )

    pair = {**assistant_msg, "sender": "assistant"}
    question_row = {"id": "", "content": payload.question, "sender": "user"}
    pair["metadata_json"] = json.dumps({"pins": payload.pins, "mode": payload.mode}, ensure_ascii=False)
    message = format_message_pair([question_row, pair])[0]
    return {"message": message}


@app.patch("/api/conversations/{conv_id}", tags=["گفت‌وگو"])
async def rename_conversation_endpoint(conv_id: str = Path(...), payload: RenameRequest = ..., user: dict = Depends(current_user)):
    if not rename_conversation(conv_id, user["id"], payload.title.strip()):
        raise HTTPException(status_code=404, detail="گفت‌وگوی مورد نظر یافت نشد.")
    return {"status": "success", "title": payload.title.strip()}


@app.delete("/api/conversations/{conv_id}", tags=["گفت‌وگو"])
async def delete_conversation_endpoint(conv_id: str = Path(...), user: dict = Depends(current_user)):
    conv = get_conversation(conv_id, owner_id=user["id"])
    if not conv:
        raise HTTPException(status_code=404, detail="گفت‌وگوی مورد نظر یافت نشد.")

    image_path = os.path.join(UPLOAD_DIR, conv["image_filename"])
    if os.path.exists(image_path):
        try:
            os.remove(image_path)
        except Exception:
            pass
    if conv.get("image_b_filename"):
        image_b_path = os.path.join(UPLOAD_DIR, conv["image_b_filename"])
        if os.path.exists(image_b_path):
            try:
                os.remove(image_b_path)
            except Exception:
                pass

    delete_conversation(conv_id)
    return {"status": "success", "message": "گفت‌وگو و تصویر مربوطه با موفقیت حذف گردید."}


@app.post("/api/messages/{message_id}/rate", tags=["بازخورد"])
async def rate_message_endpoint(message_id: str = Path(...), payload: RateRequest = ..., user: dict = Depends(current_user)):
    success = rate_message(message_id, payload.rating, owner_id=user["id"])
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
