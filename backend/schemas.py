# -*- coding: utf-8 -*-
"""
Pydantic schemas for the Persian VQA FastAPI backend.
"""
from __future__ import annotations
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class MessageItem(BaseModel):
    id: str
    conversation_id: str
    sender: str
    content: str
    confidence: Optional[str] = None
    evidence: Optional[str] = None
    level: Optional[int] = None
    latency_ms: Optional[float] = 0.0
    rating: Optional[int] = 0
    status: Optional[str] = "completed"
    created_at: str


class ConversationSummary(BaseModel):
    id: str
    title: str
    image_filename: str
    image_url: str
    image_width: Optional[int] = None
    image_height: Optional[int] = None
    created_at: str
    updated_at: str
    message_count: int = 0
    last_answer: Optional[str] = None


class ConversationDetail(BaseModel):
    id: str
    title: str
    image_filename: str
    image_url: str
    image_width: Optional[int] = None
    image_height: Optional[int] = None
    created_at: str
    updated_at: str
    messages: List[MessageItem] = []


class AnalyzeResponse(BaseModel):
    conversation_id: str
    message_id: str
    question: str
    normalized_question: str
    answer: str
    confidence: str
    evidence: str
    level: int
    model: str
    latency_ms: float
    image_url: str
    status: str = "completed"


class FollowUpRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=4000)
    level: Optional[int] = Field(default=None, ge=1, le=4)


class RateRequest(BaseModel):
    rating: int = Field(..., ge=-1, le=1)  # -1 (bad), 1 (good), 0 (neutral)


class HealthResponse(BaseModel):
    status: str
    ai_service_url: str
    ai_online: bool
    model: str
    device_info: str


class StatsResponse(BaseModel):
    total_conversations: int
    total_questions: int
    avg_latency_ms: float
    level_distribution: Dict[str, int]
    confidence_distribution: Dict[str, int]
