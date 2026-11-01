"""OfflineLessonService sync: accept sessions recorded offline.

The client sends the answers it captured; the server re-grades every answer
with the deterministic engine (it never trusts client-side outcomes), stores
the session, builds the summary and updates progress. Each offline session is
idempotent on `client_session_id`; each answer on `client_response_id`.
"""

from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DB

from app.core.errors import AppError
from app.db.base import as_utc, utcnow
from app.lesson_engine import engine
from app.lesson_engine.engine import MISCONCEPTIONS_HI, EngineState
from app.models import LessonQuestion, LessonVersion, OfflineSyncEvent, Session, SessionResponse, User
from app.schemas import SyncItemResult, SyncSessionIn
from app.services import summary_service
from app.services.access import audit, get_group

log = logging.getLogger("boltitoli.sync")


def sync_session(db: DB, user: User, item: SyncSessionIn) -> SyncItemResult:
    existing = db.scalar(select(Session).where(Session.client_session_id == item.client_session_id))
    if existing:
        if existing.school_id != user.school_id:
            return SyncItemResult(client_session_id=item.client_session_id, status="rejected",
                                  error="id_conflict")
        return SyncItemResult(client_session_id=item.client_session_id, status="duplicate", session_id=existing.id)
    try:
        session_id = _create(db, user, item)
    except AppError as e:
        db.rollback()
        _record(db, user, item.client_session_id, "rejected", None, e.code)
        return SyncItemResult(client_session_id=item.client_session_id, status="rejected", error=e.code)
    except IntegrityError:
        db.rollback()
        dup = db.scalar(select(Session).where(Session.client_session_id == item.client_session_id))
        if dup:
            return SyncItemResult(client_session_id=item.client_session_id, status="duplicate", session_id=dup.id)
        _record(db, user, item.client_session_id, "rejected", None, "integrity_error")
        return SyncItemResult(client_session_id=item.client_session_id, status="rejected", error="integrity_error")
    return SyncItemResult(client_session_id=item.client_session_id, status="accepted", session_id=session_id)


def _record(db: DB, user: User, cid: str, status: str, ref: str | None, error: str | None) -> None:
    if db.scalar(select(OfflineSyncEvent).where(OfflineSyncEvent.client_event_id == cid)):
        return
    db.add(OfflineSyncEvent(client_event_id=cid, school_id=user.school_id, user_id=user.id,
                            event_type="offline_session", status=status, result_ref=ref, error=error))
    db.commit()


def _create(db: DB, user: User, item: SyncSessionIn) -> str:
    group = get_group(db, user, item.group_id)
    version = db.get(LessonVersion, item.lesson_version_id)
    if not version:
        raise AppError("Unknown lesson version.", code="unknown_lesson_version")
    qmap = {q.id: q for q in version.questions}
    if as_utc(item.started_at) > utcnow():
        raise AppError("Session start time is in the future.", code="bad_timestamp")

    s = Session(group_id=group.id, lesson_version_id=version.id, teacher_id=user.id,
                school_id=group.classroom.school_id, status="completed", mode="offline", voice_mode="auto",
                planned_minutes=item.planned_minutes, started_at=item.started_at,
                ended_at=item.ended_at or item.started_at, active_seconds=item.active_seconds,
                client_session_id=item.client_session_id)
    db.add(s)
    db.flush()

    st = EngineState()
    seen_keys: set[str] = set()
    for r in sorted(item.responses, key=lambda r: (r.sequence_no, r.attempt_no, r.answered_at)):
        if r.client_response_id in seen_keys:
            continue
        seen_keys.add(r.client_response_id)
        q: LessonQuestion | None = qmap.get(r.question_id)
        if q is None:
            raise AppError("An answer refers to a question outside this lesson.", code="unknown_question")
        eq = engine.Question(q.id, q.difficulty, q.kind, q.operands, q.expected_answer)
        if r.input_method == "override" and r.override_outcome:
            outcome = r.override_outcome
            mis = engine.detect_misconception(eq, r.value) if outcome == "incorrect" and r.value is not None \
                else None
        else:
            outcome, mis = engine.evaluate(eq, r.value)
        st.highest_difficulty = max(st.highest_difficulty, q.difficulty)
        db.add(SessionResponse(session_id=s.id, question_id=q.id, sequence_no=r.sequence_no,
                               attempt_no=r.attempt_no, difficulty=q.difficulty, input_method=r.input_method,
                               answer_value=r.value, confidence=None, confirmed=r.confirmed, outcome=outcome,
                               misconception=mis, idempotency_key=r.client_response_id,
                               feedback={"outcome": outcome, "misconception": mis,
                                         "misconception_hi": MISCONCEPTIONS_HI.get(mis) if mis else None,
                                         "source": "offline_sync"},
                               created_at=r.answered_at))
    s.engine_state = st.to_dict()
    db.flush()
    db.refresh(s)
    if not s.responses:
        s.status = "abandoned"
    summary_service.build_summary(db, s, use_ai=False)
    db.add(OfflineSyncEvent(client_event_id=item.client_session_id, school_id=s.school_id, user_id=user.id,
                            event_type="offline_session", status="accepted", result_ref=s.id))
    audit(db, user, "session.sync", "session", s.id, s.school_id, {"responses": len(seen_keys)})
    db.commit()
    log.info("offline_session_synced", extra={"session_id": s.id, "responses": len(seen_keys)})
    return s.id
