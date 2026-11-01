from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session as DB

from app.api.deps import get_current_user, staff
from app.core.errors import NotFound
from app.core.rate_limit import limiter
from app.db.session import get_db
from app.models import Session, User
from app.schemas import AdjustIn, AnswerIn, AnswerOut, Page, SessionCreateIn, SessionListItem, SessionOut, SummaryOut
from app.services import session_service
from app.services.access import get_session, school_ids_for
from app.services.analytics_service import _list_item, sessions_query

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.get("", response_model=Page[SessionListItem])
def list_sessions(group_id: str | None = None, status: str | None = None, since: datetime | None = None,
                  limit: int = 20, offset: int = 0, user: User = Depends(get_current_user),
                  db: DB = Depends(get_db)) -> Page[SessionListItem]:
    limit, offset = max(1, min(limit, 100)), max(0, offset)
    ids = school_ids_for(db, user)
    q = sessions_query(db, ids, since, group_id, (status,) if status else None)
    total = db.scalar(select(func.count()).select_from(q.order_by(None).subquery())) or 0
    items = [_list_item(s) for s in db.scalars(q.limit(limit).offset(offset))]
    return Page(items=items, total=total, limit=limit, offset=offset)


@router.get("/active", response_model=list[SessionOut], summary="Unfinished sessions for this school")
def active(user: User = Depends(staff), db: DB = Depends(get_db)) -> list[SessionOut]:
    rows = db.scalars(select(Session).where(Session.school_id == user.school_id,
                                            Session.status.in_(("prepared", "active", "paused"))))
    return [session_service.to_out(db, s) for s in rows]


@router.post("", response_model=SessionOut, status_code=201, summary="Prepare a session (loads the lesson)")
def create(data: SessionCreateIn, user: User = Depends(staff), db: DB = Depends(get_db)) -> SessionOut:
    return session_service.to_out(db, session_service.create(db, user, data))


@router.get("/{session_id}", response_model=SessionOut)
def get(session_id: str, user: User = Depends(get_current_user), db: DB = Depends(get_db)) -> SessionOut:
    return session_service.to_out(db, get_session(db, user, session_id))


@router.post("/{session_id}/start", response_model=SessionOut)
def start(session_id: str, user: User = Depends(staff), db: DB = Depends(get_db)) -> SessionOut:
    return session_service.to_out(db, session_service.start(db, get_session(db, user, session_id)))


@router.post("/{session_id}/answer", response_model=AnswerOut,
             summary="Submit the group's answer (idempotent with the Idempotency-Key header)")
@limiter.limit("60/minute")  # wrong answers can trigger a Claude explanation
def answer(request: Request, session_id: str, data: AnswerIn, user: User = Depends(staff), db: DB = Depends(get_db),
           idempotency_key: str | None = Header(default=None)) -> AnswerOut:
    s = get_session(db, user, session_id)
    s, fb, replayed = session_service.answer(db, user, s, data, idempotency_key)
    return AnswerOut(session=session_service.to_out(db, s), feedback=fb, replayed=replayed)


@router.post("/{session_id}/adjust", response_model=SessionOut,
             summary="Teacher asks for an easier or harder question (not graded)")
def adjust(session_id: str, data: AdjustIn, user: User = Depends(staff), db: DB = Depends(get_db)) -> SessionOut:
    return session_service.to_out(db, session_service.adjust(db, get_session(db, user, session_id), data.direction))


@router.post("/{session_id}/pause", response_model=SessionOut)
def pause(session_id: str, user: User = Depends(staff), db: DB = Depends(get_db)) -> SessionOut:
    return session_service.to_out(db, session_service.pause(db, get_session(db, user, session_id)))


@router.post("/{session_id}/resume", response_model=SessionOut)
def resume(session_id: str, user: User = Depends(staff), db: DB = Depends(get_db)) -> SessionOut:
    return session_service.to_out(db, session_service.resume(db, get_session(db, user, session_id)))


@router.post("/{session_id}/end", response_model=SessionOut, summary="End the session and build the summary")
@limiter.limit("10/minute")  # ending writes a Claude summary
def end(request: Request, session_id: str, user: User = Depends(staff), db: DB = Depends(get_db)) -> SessionOut:
    return session_service.to_out(db, session_service.end(db, user, get_session(db, user, session_id)))


@router.get("/{session_id}/summary", response_model=SummaryOut)
def summary(session_id: str, user: User = Depends(get_current_user), db: DB = Depends(get_db)):
    s = get_session(db, user, session_id)
    if not s.summary:
        raise NotFound("The summary is created when the session ends.", code="summary_not_ready")
    return s.summary
