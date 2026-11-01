"""SQLAlchemy models.

Data-minimisation rules baked into this schema:
- No table stores children's names, photos, audio or voiceprints.
- Learning groups are pseudonymous ("Udaan", "Group A"); an optional
  `leader_label` is free text the UI asks teachers to keep non-identifying.
- Session responses store the parsed numeric answer, never raw audio.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, IdMixin, TimestampMixin, utcnow

ROLES = ("teacher", "school_admin", "official")
LEVELS = ("beginner", "developing", "advancing")
SESSION_STATUSES = ("prepared", "active", "paused", "completed", "abandoned")
INPUT_METHODS = ("voice", "manual", "leader", "override")
OUTCOMES = ("correct", "incorrect", "unclear", "skipped")


class School(IdMixin, TimestampMixin, Base):
    __tablename__ = "schools"
    name: Mapped[str] = mapped_column(String(200))
    udise_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    district: Mapped[str | None] = mapped_column(String(100), nullable=True)
    block: Mapped[str | None] = mapped_column(String(100), nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    data_retention_days: Mapped[int] = mapped_column(Integer, default=730)

    classrooms: Mapped[list[Classroom]] = relationship(back_populates="school")


class User(IdMixin, TimestampMixin, Base):
    __tablename__ = "users"
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(100))
    full_name: Mapped[str] = mapped_column(String(120))
    role: Mapped[str] = mapped_column(String(20), default="teacher")
    school_id: Mapped[str | None] = mapped_column(ForeignKey("schools.id", ondelete="SET NULL"), nullable=True,
                                                  index=True)
    preferred_language: Mapped[str] = mapped_column(String(5), default="hi")
    onboarding_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    school: Mapped[School | None] = relationship()


class OfficialAccess(IdMixin, TimestampMixin, Base):
    """Explicit, auditable grant letting a CRC/block official see a school's aggregates."""
    __tablename__ = "official_access"
    __table_args__ = (UniqueConstraint("user_id", "school_id"),)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    school_id: Mapped[str] = mapped_column(ForeignKey("schools.id", ondelete="CASCADE"), index=True)
    granted_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"
    jti: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Classroom(IdMixin, TimestampMixin, Base):
    __tablename__ = "classrooms"
    school_id: Mapped[str] = mapped_column(ForeignKey("schools.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    grades: Mapped[str] = mapped_column(String(20), default="1-3")
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    school: Mapped[School] = relationship(back_populates="classrooms")
    groups: Mapped[list[LearningGroup]] = relationship(back_populates="classroom")


class Skill(IdMixin, TimestampMixin, Base):
    __tablename__ = "skills"
    code: Mapped[str] = mapped_column(String(50), unique=True)
    name_en: Mapped[str] = mapped_column(String(120))
    name_hi: Mapped[str] = mapped_column(String(120))
    level: Mapped[str] = mapped_column(String(20))
    grade_band: Mapped[str] = mapped_column(String(20))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    description_hi: Mapped[str] = mapped_column(Text, default="")
    curriculum_refs: Mapped[list[str]] = mapped_column(JSON, default=list)


class LearningGroup(IdMixin, TimestampMixin, Base):
    __tablename__ = "learning_groups"
    classroom_id: Mapped[str] = mapped_column(ForeignKey("classrooms.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(60))
    level: Mapped[str] = mapped_column(String(20), default="beginner")
    size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    leader_label: Mapped[str | None] = mapped_column(String(40), nullable=True)
    current_skill_id: Mapped[str | None] = mapped_column(ForeignKey("skills.id", ondelete="SET NULL"),
                                                         nullable=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    classroom: Mapped[Classroom] = relationship(back_populates="groups")
    current_skill: Mapped[Skill | None] = relationship()


class Lesson(IdMixin, TimestampMixin, Base):
    __tablename__ = "lessons"
    skill_id: Mapped[str] = mapped_column(ForeignKey("skills.id", ondelete="CASCADE"), index=True)
    code: Mapped[str] = mapped_column(String(60), unique=True)
    title_hi: Mapped[str] = mapped_column(String(160))
    title_en: Mapped[str] = mapped_column(String(160))
    published_version_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    skill: Mapped[Skill] = relationship()
    versions: Mapped[list[LessonVersion]] = relationship(back_populates="lesson", order_by="LessonVersion.version")


class LessonVersion(IdMixin, TimestampMixin, Base):
    """Immutable once published. status: draft -> reviewed (by a named teacher)."""
    __tablename__ = "lesson_versions"
    __table_args__ = (UniqueConstraint("lesson_id", "version"),)
    lesson_id: Mapped[str] = mapped_column(ForeignKey("lessons.id", ondelete="CASCADE"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="draft")
    source: Mapped[str] = mapped_column(String(20), default="authored")  # authored | ai_draft
    objective_hi: Mapped[str] = mapped_column(Text)
    intro_hi: Mapped[str] = mapped_column(Text)
    completion_criteria: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    reviewed_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    lesson: Mapped[Lesson] = relationship(back_populates="versions")
    questions: Mapped[list[LessonQuestion]] = relationship(back_populates="version",
                                                           order_by="LessonQuestion.position",
                                                           cascade="all, delete-orphan")


class LessonQuestion(IdMixin, Base):
    __tablename__ = "lesson_questions"
    version_id: Mapped[str] = mapped_column(ForeignKey("lesson_versions.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer)
    difficulty: Mapped[int] = mapped_column(Integer)  # 1 easier, 2 core, 3 challenge
    kind: Mapped[str] = mapped_column(String(30))  # count, add, sub, compare, place_value, before_after, word
    prompt_hi: Mapped[str] = mapped_column(Text)
    prompt_en: Mapped[str] = mapped_column(Text)
    operands: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    expected_answer: Mapped[int] = mapped_column(Integer)
    hint_hi: Mapped[str] = mapped_column(Text)
    explanation_hi: Mapped[str] = mapped_column(Text)
    visual: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)

    version: Mapped[LessonVersion] = relationship(back_populates="questions")


class Session(IdMixin, TimestampMixin, Base):
    __tablename__ = "sessions"
    __table_args__ = (Index("ix_sessions_group_started", "group_id", "started_at"),)
    group_id: Mapped[str] = mapped_column(ForeignKey("learning_groups.id", ondelete="CASCADE"), index=True)
    lesson_version_id: Mapped[str] = mapped_column(ForeignKey("lesson_versions.id", ondelete="RESTRICT"))
    teacher_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    school_id: Mapped[str] = mapped_column(ForeignKey("schools.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(20), default="prepared")
    mode: Mapped[str] = mapped_column(String(10), default="online")  # online | offline
    voice_mode: Mapped[str] = mapped_column(String(20), default="auto")  # auto | text_only
    planned_minutes: Mapped[int] = mapped_column(Integer, default=15)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_resumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    active_seconds: Mapped[int] = mapped_column(Integer, default=0)
    engine_state: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    client_session_id: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)

    group: Mapped[LearningGroup] = relationship()
    lesson_version: Mapped[LessonVersion] = relationship()
    responses: Mapped[list[SessionResponse]] = relationship(back_populates="session",
                                                           order_by="SessionResponse.created_at",
                                                           cascade="all, delete-orphan")
    summary: Mapped[SessionSummary | None] = relationship(back_populates="session", uselist=False,
                                                          cascade="all, delete-orphan")


class SessionResponse(IdMixin, Base):
    __tablename__ = "session_responses"
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"), index=True)
    question_id: Mapped[str] = mapped_column(ForeignKey("lesson_questions.id", ondelete="RESTRICT"))
    sequence_no: Mapped[int] = mapped_column(Integer, default=1)  # nth question shown in this session
    attempt_no: Mapped[int] = mapped_column(Integer, default=1)
    difficulty: Mapped[int] = mapped_column(Integer, default=1)
    input_method: Mapped[str] = mapped_column(String(20))
    answer_value: Mapped[int | None] = mapped_column(Integer, nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    outcome: Mapped[str] = mapped_column(String(20))
    misconception: Mapped[str | None] = mapped_column(String(50), nullable=True)
    idempotency_key: Mapped[str] = mapped_column(String(64), unique=True)
    feedback: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    session: Mapped[Session] = relationship(back_populates="responses")
    question: Mapped[LessonQuestion] = relationship()


class SessionSummary(IdMixin, TimestampMixin, Base):
    __tablename__ = "session_summaries"
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"), unique=True)
    stats: Mapped[dict[str, Any]] = mapped_column(JSON)
    summary_hi: Mapped[str] = mapped_column(Text)
    next_activity_hi: Mapped[str] = mapped_column(Text)
    level_suggestion: Mapped[str] = mapped_column(String(20), default="keep")  # keep | review_up | review_down
    level_suggestion_reason_hi: Mapped[str | None] = mapped_column(Text, nullable=True)
    generated_by: Mapped[str] = mapped_column(String(20), default="rules")  # rules | claude

    session: Mapped[Session] = relationship(back_populates="summary")


class GroupProgress(IdMixin, TimestampMixin, Base):
    __tablename__ = "group_progress"
    __table_args__ = (UniqueConstraint("group_id", "skill_id"),)
    group_id: Mapped[str] = mapped_column(ForeignKey("learning_groups.id", ondelete="CASCADE"), index=True)
    skill_id: Mapped[str] = mapped_column(ForeignKey("skills.id", ondelete="CASCADE"))
    sessions_count: Mapped[int] = mapped_column(Integer, default=0)
    questions_attempted: Mapped[int] = mapped_column(Integer, default=0)
    correct_first_try: Mapped[int] = mapped_column(Integer, default=0)
    correct_total: Mapped[int] = mapped_column(Integer, default=0)
    highest_difficulty: Mapped[int] = mapped_column(Integer, default=1)
    last_session_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ConsentRecord(IdMixin, TimestampMixin, Base):
    __tablename__ = "consent_records"
    school_id: Mapped[str] = mapped_column(ForeignKey("schools.id", ondelete="CASCADE"), index=True)
    recorded_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    consent_type: Mapped[str] = mapped_column(String(40))  # school_authorisation | parent_notice | parent_consent
    scope: Mapped[str] = mapped_column(String(200))
    method: Mapped[str] = mapped_column(String(40))  # signed_form | smc_meeting | written_notice | other
    reference: Mapped[str | None] = mapped_column(String(200), nullable=True)
    granted_on: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_on: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class OfflineSyncEvent(IdMixin, Base):
    __tablename__ = "offline_sync_events"
    client_event_id: Mapped[str] = mapped_column(String(64), unique=True)
    school_id: Mapped[str] = mapped_column(ForeignKey("schools.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    event_type: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(20))  # accepted | rejected
    result_ref: Mapped[str | None] = mapped_column(String(36), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AuditEvent(IdMixin, Base):
    __tablename__ = "audit_events"
    actor_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    school_id: Mapped[str | None] = mapped_column(ForeignKey("schools.id", ondelete="CASCADE"), nullable=True,
                                                  index=True)
    action: Mapped[str] = mapped_column(String(60))
    entity_type: Mapped[str] = mapped_column(String(40))
    entity_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    meta: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
