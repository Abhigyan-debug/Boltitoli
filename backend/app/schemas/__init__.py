"""Pydantic request/response schemas for the v1 API."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

T = TypeVar("T")

Level = Literal["beginner", "developing", "advancing"]
Role = Literal["teacher", "school_admin", "official"]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    limit: int
    offset: int


# ----------------------------------------------------------------- auth ---- #
def _password_ok(v: str) -> str:
    if len(v.encode("utf-8")) > 72:
        raise ValueError("Password must be at most 72 bytes")
    if len(v) < 8:
        raise ValueError("Password must be at least 8 characters")
    if not any(c.isdigit() for c in v) or not any(c.isalpha() for c in v):
        raise ValueError("Password must include letters and numbers")
    return v


class SchoolIn(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    udise_code: str | None = Field(default=None, max_length=20, pattern=r"^[0-9]{6,20}$")
    district: str | None = Field(default=None, max_length=100)
    block: str | None = Field(default=None, max_length=100)


class RegisterIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str
    school: SchoolIn

    @field_validator("password")
    @classmethod
    def _pw(cls, v: str) -> str:
        return _password_ok(v)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class SchoolOut(ORM):
    id: str
    name: str
    udise_code: str | None
    district: str | None
    block: str | None
    is_demo: bool
    data_retention_days: int


class UserOut(ORM):
    id: str
    email: str
    full_name: str
    role: Role
    school_id: str | None
    preferred_language: str
    onboarding_completed: bool
    school: SchoolOut | None = None


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut


class UserUpdateIn(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    preferred_language: Literal["hi", "en"] | None = None
    onboarding_completed: bool | None = None


class PasswordChangeIn(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def _pw(cls, v: str) -> str:
        return _password_ok(v)


class SchoolUpdateIn(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    district: str | None = Field(default=None, max_length=100)
    block: str | None = Field(default=None, max_length=100)
    data_retention_days: int | None = Field(default=None, ge=90, le=3650)


# ----------------------------------------------------- classrooms/groups ---- #
class ClassroomIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    grades: str = Field(default="1-3", pattern=r"^[1-5](-[1-5])?$")


class ClassroomUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    grades: str | None = Field(default=None, pattern=r"^[1-5](-[1-5])?$")
    archived: bool | None = None


class ClassroomOut(ORM):
    id: str
    school_id: str
    name: str
    grades: str
    archived_at: datetime | None
    created_at: datetime
    group_count: int = 0


class GroupIn(BaseModel):
    classroom_id: str
    name: str = Field(min_length=1, max_length=60)
    level: Level = "beginner"
    size: int | None = Field(default=None, ge=1, le=60)
    leader_label: str | None = Field(default=None, max_length=40)
    current_skill_id: str | None = None


class GroupUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=60)
    level: Level | None = None
    size: int | None = Field(default=None, ge=1, le=60)
    leader_label: str | None = Field(default=None, max_length=40)
    current_skill_id: str | None = None
    archived: bool | None = None


class SkillOut(ORM):
    id: str
    code: str
    name_en: str
    name_hi: str
    level: Level
    grade_band: str
    sort_order: int
    description_hi: str
    curriculum_refs: list[str]


class GroupOut(ORM):
    id: str
    classroom_id: str
    name: str
    level: Level
    size: int | None
    leader_label: str | None
    current_skill_id: str | None
    current_skill: SkillOut | None
    archived_at: datetime | None
    created_at: datetime
    last_session_at: datetime | None = None
    sessions_count: int = 0


# --------------------------------------------------------------- lessons ---- #
class QuestionOut(ORM):
    id: str
    position: int
    difficulty: int
    kind: str
    prompt_hi: str
    prompt_en: str
    operands: dict[str, Any]
    expected_answer: int
    hint_hi: str
    explanation_hi: str
    visual: dict[str, Any] | None


class LessonVersionOut(ORM):
    id: str
    lesson_id: str
    version: int
    status: Literal["draft", "reviewed"]
    source: str
    objective_hi: str
    intro_hi: str
    completion_criteria: dict[str, Any]
    reviewed_by_name: str | None = None
    reviewed_at: datetime | None
    review_note: str | None
    question_count: int = 0


class LessonOut(ORM):
    id: str
    code: str
    title_hi: str
    title_en: str
    skill: SkillOut
    published_version: LessonVersionOut | None = None
    latest_version: LessonVersionOut | None = None


class LessonDetailOut(LessonOut):
    questions: list[QuestionOut] = []


class ReviewIn(BaseModel):
    version_id: str
    note: str | None = Field(default=None, max_length=1000)


class DraftQuestionsIn(BaseModel):
    count: int = Field(default=5, ge=1, le=10)
    difficulty: int = Field(default=2, ge=1, le=3)


class LessonPackOut(BaseModel):
    pack_id: str
    lesson_id: str
    lesson_code: str
    version_id: str
    version: int
    status: str
    skill: SkillOut
    title_hi: str
    objective_hi: str
    intro_hi: str
    completion_criteria: dict[str, Any]
    questions: list[QuestionOut]
    audio: dict[str, str] = Field(default_factory=dict,
                                  description="text cache key -> audio URL for pre-generated clips")
    audio_status: Literal["included", "unavailable", "partial"] = "unavailable"
    built_at: datetime


# -------------------------------------------------------------- sessions ---- #
class SessionCreateIn(BaseModel):
    group_id: str
    skill_id: str | None = None
    planned_minutes: int = Field(default=15, ge=5, le=30)
    voice_mode: Literal["auto", "text_only"] = "auto"


InputMethod = Literal["voice", "manual", "leader", "override"]


class AnswerIn(BaseModel):
    question_id: str = Field(description="The question being answered; must match the current question")
    input_method: InputMethod
    value: int | None = Field(default=None, ge=0, le=1000)
    text: str | None = Field(default=None, max_length=200, description="Typed or recognised text to parse")
    confidence: float | None = Field(default=None, ge=0, le=1)
    confirmed: bool = False
    override_outcome: Literal["correct", "incorrect", "skipped"] | None = None


class AdjustIn(BaseModel):
    direction: Literal["easier", "harder"]


class FeedbackOut(BaseModel):
    outcome: Literal["correct", "incorrect", "unclear", "skipped"]
    action: str
    misconception: str | None
    misconception_hi: str | None
    message_hi: str
    hint_hi: str | None = None
    explanation_hi: str | None = None
    suggest_manual: bool = False
    mastery_signal: bool = False
    feedback_source: Literal["rules", "claude"] = "rules"


class SessionOut(ORM):
    id: str
    group_id: str
    group_name: str
    skill: SkillOut
    lesson_id: str
    lesson_title_hi: str
    lesson_version_id: str
    lesson_status: str
    status: Literal["prepared", "active", "paused", "completed", "abandoned"]
    mode: str
    voice_mode: str
    planned_minutes: int
    started_at: datetime
    ended_at: datetime | None
    active_seconds: int
    current_question: QuestionOut | None
    current_attempt: int
    current_difficulty: int
    questions_completed: int
    intro_hi: str
    has_summary: bool = False


class AnswerOut(BaseModel):
    session: SessionOut
    feedback: FeedbackOut
    replayed: bool = False


class SessionListItem(BaseModel):
    id: str
    group_id: str
    group_name: str
    skill_name_hi: str
    skill_name_en: str
    status: str
    mode: str
    started_at: datetime
    ended_at: datetime | None
    active_seconds: int
    questions_attempted: int
    correct_first_try: int


class SummaryOut(ORM):
    session_id: str
    stats: dict[str, Any]
    summary_hi: str
    next_activity_hi: str
    level_suggestion: Literal["keep", "review_up", "review_down"]
    level_suggestion_reason_hi: str | None
    generated_by: Literal["rules", "claude"]
    created_at: datetime


# ---------------------------------------------------------------- speech ---- #
class TranscriptionOut(BaseModel):
    text: str
    value: int | None
    parse_status: str
    confidence: float | None
    usable: bool
    needs_confirmation: bool
    needs_retry: bool
    provider: str


class TTSIn(BaseModel):
    text: str = Field(min_length=1, max_length=600)


# ------------------------------------------------------------------ sync ---- #
class SyncResponseIn(BaseModel):
    client_response_id: str = Field(min_length=8, max_length=64)
    question_id: str
    sequence_no: int = Field(ge=1, le=500)
    attempt_no: int = Field(ge=1, le=2)
    input_method: InputMethod
    value: int | None = Field(default=None, ge=0, le=1000)
    confirmed: bool = True
    override_outcome: Literal["correct", "incorrect", "skipped"] | None = None
    answered_at: datetime


class SyncSessionIn(BaseModel):
    client_session_id: str = Field(min_length=8, max_length=64)
    group_id: str
    lesson_version_id: str
    planned_minutes: int = Field(default=15, ge=5, le=30)
    started_at: datetime
    ended_at: datetime | None = None
    active_seconds: int = Field(ge=0, le=4 * 3600)
    responses: list[SyncResponseIn] = Field(max_length=300)


class SyncIn(BaseModel):
    sessions: list[SyncSessionIn] = Field(max_length=50)


class SyncItemResult(BaseModel):
    client_session_id: str
    status: Literal["accepted", "duplicate", "rejected"]
    session_id: str | None = None
    error: str | None = None


class SyncOut(BaseModel):
    results: list[SyncItemResult]


# ------------------------------------------------------------- analytics ---- #
class OverviewOut(BaseModel):
    period_days: int
    sessions_completed: int
    practice_minutes: int
    active_groups: int
    questions_attempted: int
    first_try_accuracy: float | None
    accuracy_sample: int
    offline_sessions: int
    recent_sessions: list[SessionListItem]
    recommendation: dict[str, Any] | None
    is_demo: bool


class GroupAnalytics(BaseModel):
    group_id: str
    group_name: str
    level: str
    weekly: list[dict[str, Any]]
    skills: list[dict[str, Any]]
    misconceptions: list[dict[str, Any]]
    questions_attempted: int
    first_try_accuracy: float | None
    enough_data: bool


# ------------------------------------------------------- consent / admin ---- #
class ConsentIn(BaseModel):
    consent_type: Literal["school_authorisation", "parent_notice", "parent_consent"]
    scope: str = Field(min_length=3, max_length=200)
    method: Literal["signed_form", "smc_meeting", "written_notice", "other"]
    reference: str | None = Field(default=None, max_length=200)
    granted_on: datetime
    notes: str | None = Field(default=None, max_length=2000)


class ConsentOut(ORM):
    id: str
    consent_type: str
    scope: str
    method: str
    reference: str | None
    granted_on: datetime
    revoked_on: datetime | None
    notes: str | None
    created_at: datetime


class AuditOut(ORM):
    id: str
    actor_id: str | None
    action: str
    entity_type: str
    entity_id: str | None
    meta: dict[str, Any]
    at: datetime
