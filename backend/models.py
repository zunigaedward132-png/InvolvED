from pydantic import BaseModel, Field
from typing import Optional
from uuid import UUID
from datetime import datetime


class ActivityCreate(BaseModel):
    user_id: UUID
    title: str = Field(..., min_length=1, max_length=200)
    category: Optional[str] = "general"
    raw_submission: str = Field(..., min_length=1, max_length=5000)


class AIMetricsOut(BaseModel):
    id: UUID
    activity_id: UUID
    action_verb: Optional[str]
    quantifiable_metric: Optional[str]
    competency_tags: list[str]
    linkedin_keywords: list[str]
    created_at: datetime


class ActivityOut(BaseModel):
    id: UUID
    user_id: UUID
    title: str
    category: Optional[str]
    raw_submission: Optional[str]
    status: str
    created_at: datetime
    updated_at: datetime
    ai_metrics: Optional[AIMetricsOut] = None


class UserCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    email: Optional[str] = None
    role: str = Field(default="member", pattern="^(member|officer|advisor)$")


class UserOut(BaseModel):
    id: UUID
    name: str
    email: Optional[str]
    role: str
    created_at: datetime
