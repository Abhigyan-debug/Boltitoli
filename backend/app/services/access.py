"""Tenant boundaries. Every lookup of a school-owned row goes through here."""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session as DB

from app.core.errors import Forbidden, NotFound
from app.db.base import utcnow
from app.models import AuditEvent, Classroom, LearningGroup, OfficialAccess, Session, User


def school_ids_for(db: DB, user: User) -> list[str]:
    if user.role == "official":
        return list(db.scalars(select(OfficialAccess.school_id).where(OfficialAccess.user_id == user.id)))
    return [user.school_id] if user.school_id else []


def require_school(user: User) -> str:
    if not user.school_id:
        raise Forbidden("Your account is not linked to a school.", code="no_school")
    return user.school_id


def get_classroom(db: DB, user: User, classroom_id: str) -> Classroom:
    c = db.get(Classroom, classroom_id)
    if not c or c.school_id != user.school_id:
        raise NotFound("Classroom not found.")
    return c


def get_group(db: DB, user: User, group_id: str) -> LearningGroup:
    g = db.get(LearningGroup, group_id)
    if not g or g.classroom.school_id != user.school_id:
        raise NotFound("Learning group not found.")
    return g


def get_session(db: DB, user: User, session_id: str) -> Session:
    s = db.get(Session, session_id)
    if not s or s.school_id not in school_ids_for(db, user):
        raise NotFound("Session not found.")
    return s


def audit(db: DB, actor: User | None, action: str, entity_type: str, entity_id: str | None,
          school_id: str | None, meta: dict[str, Any] | None = None) -> None:
    db.add(AuditEvent(actor_id=actor.id if actor else None, school_id=school_id, action=action,
                      entity_type=entity_type, entity_id=entity_id, meta=meta or {}, at=utcnow()))
