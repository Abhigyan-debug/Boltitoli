"""The 15-minute guided session workflow (online, server-authoritative)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DB

from app.core.config import get_settings
from app.core.errors import AppError, Conflict, NotFound
from app.db.base import as_utc, new_id, utcnow
from app.lesson_engine import engine
from app.lesson_engine.engine import MISCONCEPTIONS_HI, EngineState
from app.lesson_engine.hindi_numbers import parse_answer
from app.models import LessonQuestion, Session, SessionResponse, Skill, User
from app.schemas import AnswerIn, FeedbackOut, QuestionOut, SessionCreateIn, SessionOut, SkillOut
from app.services import adaptive_service, lesson_service, summary_service
from app.services.access import audit, get_group


def running_seconds(s: Session, now: datetime | None = None) -> int:
    total = s.active_seconds or 0
    if s.status == "active" and s.last_resumed_at:
        total += max(0, int(((now or utcnow()) - as_utc(s.last_resumed_at)).total_seconds()))
    return total


def to_out(db: DB, s: Session) -> SessionOut:
    st = EngineState.from_dict(s.engine_state)
    v = s.lesson_version
    current = db.get(LessonQuestion, st.current_question_id) if st.current_question_id else None
    return SessionOut(
        id=s.id, group_id=s.group_id, group_name=s.group.name, skill=SkillOut.model_validate(v.lesson.skill),
        lesson_id=v.lesson_id, lesson_title_hi=v.lesson.title_hi, lesson_version_id=v.id, lesson_status=v.status,
        status=s.status,
        mode=s.mode, voice_mode=s.voice_mode, planned_minutes=s.planned_minutes, started_at=s.started_at,
        ended_at=s.ended_at, active_seconds=running_seconds(s), intro_hi=v.intro_hi,
        current_question=QuestionOut.model_validate(current) if current and s.status in ("prepared", "active",
                                                                                          "paused") else None,
        current_attempt=st.attempt, current_difficulty=st.difficulty, questions_completed=st.questions_completed,
        has_summary=s.summary is not None)


def create(db: DB, user: User, data: SessionCreateIn) -> Session:
    group = get_group(db, user, data.group_id)
    if group.archived_at:
        raise AppError("This group is archived.", code="group_archived")
    skill_id = data.skill_id or group.current_skill_id
    if not skill_id or not db.get(Skill, skill_id):
        raise AppError("Choose a skill for this group first.", code="skill_required")
    existing = db.scalar(select(Session).where(Session.group_id == group.id,
                                               Session.status.in_(("prepared", "active", "paused"))))
    if existing:
        raise Conflict("This group already has an unfinished session.", code="session_in_progress",
                       details={"session_id": existing.id})
    lesson = lesson_service.lesson_for_skill(db, skill_id)
    version = lesson_service.active_version(db, lesson)
    questions = lesson_service.engine_questions(version)
    if not questions:
        raise AppError("This lesson has no questions.", code="empty_lesson")
    state = engine.start(questions)
    s = Session(group_id=group.id, lesson_version_id=version.id, teacher_id=user.id,
                school_id=group.classroom.school_id, status="prepared", mode="online",
                voice_mode=data.voice_mode, planned_minutes=data.planned_minutes, started_at=utcnow(),
                engine_state=state.to_dict())
    if group.current_skill_id != skill_id:
        group.current_skill_id = skill_id
    db.add(s)
    audit(db, user, "session.create", "session", s.id, s.school_id, {"group": group.id})
    db.commit()
    db.refresh(s)
    return s


def start(db: DB, s: Session) -> Session:
    if s.status == "active":
        return s
    if s.status != "prepared":
        raise Conflict("Session cannot be started from its current state.", code="invalid_state")
    now = utcnow()
    s.status, s.started_at, s.last_resumed_at = "active", now, now
    db.commit()
    return s


def pause(db: DB, s: Session) -> Session:
    if s.status == "paused":
        return s
    if s.status != "active":
        raise Conflict("Only an active session can be paused.", code="invalid_state")
    s.active_seconds = running_seconds(s)
    s.status, s.last_resumed_at = "paused", None
    db.commit()
    return s


def resume(db: DB, s: Session) -> Session:
    if s.status == "active":
        return s
    if s.status != "paused":
        raise Conflict("Only a paused session can be resumed.", code="invalid_state")
    s.status, s.last_resumed_at = "active", utcnow()
    db.commit()
    return s


def end(db: DB, user: User, s: Session) -> Session:
    if s.status in ("completed", "abandoned"):
        return s
    s.active_seconds = running_seconds(s)
    s.last_resumed_at = None
    s.ended_at = utcnow()
    s.status = "completed" if s.responses else "abandoned"
    summary_service.build_summary(db, s)
    audit(db, user, "session.end", "session", s.id, s.school_id, {"status": s.status})
    db.commit()
    return s


def answer(db: DB, user: User, s: Session, data: AnswerIn, idempotency_key: str | None
           ) -> tuple[Session, FeedbackOut, bool]:
    key = (idempotency_key or "").strip() or new_id()
    if len(key) > 64:
        raise AppError("Idempotency-Key is too long.", code="bad_idempotency_key")
    prior = db.scalar(select(SessionResponse).where(SessionResponse.idempotency_key == key))
    if prior:
        if prior.session_id != s.id:
            raise Conflict("Idempotency-Key was already used for another session.", code="idempotency_conflict")
        return s, FeedbackOut.model_validate(prior.feedback), True

    if s.status != "active":
        raise Conflict("The session is not running. Start or resume it first.", code="session_not_active")
    st = EngineState.from_dict(s.engine_state)
    if data.question_id != st.current_question_id:
        raise Conflict("This answer is for an earlier question.", code="stale_question",
                       details={"current_question_id": st.current_question_id})
    q = db.get(LessonQuestion, data.question_id)
    if not q:
        raise NotFound("Question not found.")

    settings = get_settings()
    value: int | None = data.value
    if value is None and data.text:
        parsed = parse_answer(data.text)
        value = parsed.value

    if data.input_method == "override":
        if not data.override_outcome:
            raise AppError("Choose correct, incorrect or skip for a teacher override.", code="override_required")
        outcome, misconception = data.override_outcome, None
        if outcome == "incorrect" and value is not None:
            misconception = engine.detect_misconception(_eq(q), value)
    else:
        uncertain_voice = data.input_method == "voice" and not data.confirmed and (
            data.confidence is None or data.confidence < settings.stt_min_confidence)
        if uncertain_voice:
            value = None  # never grade uncertain speech
        outcome, misconception = engine.evaluate(_eq(q), value)

    attempt_before, seq, diff = st.attempt, len(st.asked), q.difficulty
    questions = lesson_service.engine_questions(s.lesson_version)
    decision = engine.apply_outcome(st, questions, outcome, misconception)

    explanation, source = None, "rules"
    if decision.show_explanation:
        explanation = q.explanation_hi
        ai = adaptive_service.ai_explanation(q, value, misconception) if misconception else None
        if ai:
            explanation, source = ai, "claude"
    fb = FeedbackOut(outcome=outcome, action=decision.action, misconception=misconception,
                     misconception_hi=MISCONCEPTIONS_HI.get(misconception) if misconception else None,
                     message_hi=adaptive_service.message_for(decision, seq, attempt_before),
                     hint_hi=q.hint_hi if decision.show_hint else None, explanation_hi=explanation,
                     suggest_manual=decision.suggest_manual, mastery_signal=decision.mastery_signal,
                     feedback_source=source)

    s.engine_state = st.to_dict()
    db.add(SessionResponse(session_id=s.id, question_id=q.id, sequence_no=seq, attempt_no=attempt_before,
                           difficulty=diff, input_method=data.input_method, answer_value=value,
                           confidence=data.confidence, confirmed=data.confirmed, outcome=outcome,
                           misconception=misconception, idempotency_key=key, feedback=fb.model_dump()))
    try:
        db.commit()
    except IntegrityError as e:  # concurrent duplicate submit with the same key
        db.rollback()
        prior = db.scalar(select(SessionResponse).where(SessionResponse.idempotency_key == key))
        if prior:
            db.refresh(s)
            return s, FeedbackOut.model_validate(prior.feedback), True
        raise Conflict("Could not save the answer, please retry.", code="write_conflict") from e
    db.refresh(s)
    return s, fb, False


def _eq(q: LessonQuestion) -> engine.Question:
    return engine.Question(q.id, q.difficulty, q.kind, q.operands, q.expected_answer)


def adjust(db: DB, s: Session, direction: str) -> Session:
    if s.status != "active":
        raise Conflict("The session is not running.", code="session_not_active")
    st = EngineState.from_dict(s.engine_state)
    engine.adjust(st, lesson_service.engine_questions(s.lesson_version), -1 if direction == "easier" else 1)
    s.engine_state = st.to_dict()
    db.commit()
    return s
