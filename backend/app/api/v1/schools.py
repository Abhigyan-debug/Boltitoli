"""School settings, staff, consent records, audit log and data retention."""

from __future__ import annotations

import secrets
from datetime import timedelta

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import delete, select
from sqlalchemy.orm import Session as DB

from app.api.deps import admin, admin_not_demo, get_current_user, staff
from app.core.errors import Conflict, NotFound
from app.core.security import hash_password
from app.db.base import utcnow
from app.db.session import get_db
from app.models import AuditEvent, ConsentRecord, School, Session, User
from app.schemas import AuditOut, ConsentIn, ConsentOut, SchoolOut, SchoolUpdateIn, UserOut
from app.services.access import audit, require_school, school_ids_for

router = APIRouter(prefix="/schools", tags=["schools"])


@router.get("", response_model=list[SchoolOut], summary="Schools the current user can see")
def list_schools(user: User = Depends(get_current_user), db: DB = Depends(get_db)) -> list[School]:
    return [db.get(School, i) for i in school_ids_for(db, user)]  # type: ignore[misc]


@router.get("/current", response_model=SchoolOut)
def current(user: User = Depends(staff), db: DB = Depends(get_db)) -> School:
    return db.get(School, require_school(user))  # type: ignore[return-value]


@router.patch("/current", response_model=SchoolOut)
def update_current(data: SchoolUpdateIn, user: User = Depends(admin_not_demo), db: DB = Depends(get_db)) -> School:
    school = db.get(School, require_school(user))
    changes = data.model_dump(exclude_unset=True)
    for k, v in changes.items():
        setattr(school, k, v)
    audit(db, user, "school.update", "school", school.id, school.id, {"fields": sorted(changes)})
    db.commit()
    return school  # type: ignore[return-value]


# ---------------------------------------------------------------- staff ---- #
class StaffIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr


class StaffCreated(BaseModel):
    user: UserOut
    temporary_password: str


@router.get("/current/staff", response_model=list[UserOut])
def staff_list(user: User = Depends(staff), db: DB = Depends(get_db)) -> list[User]:
    return list(db.scalars(select(User).where(User.school_id == require_school(user)).order_by(User.created_at)))


@router.post("/current/staff", response_model=StaffCreated, status_code=201,
             summary="Add a teacher account (temporary password is shown once)")
def staff_add(data: StaffIn, user: User = Depends(admin_not_demo), db: DB = Depends(get_db)) -> StaffCreated:
    email = data.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise Conflict("An account with this email already exists.", code="email_taken")
    temp = secrets.token_urlsafe(9) + "7a"
    t = User(email=email, full_name=data.full_name, password_hash=hash_password(temp), role="teacher",
             school_id=user.school_id)
    db.add(t)
    db.flush()
    audit(db, user, "staff.add", "user", t.id, user.school_id)
    db.commit()
    return StaffCreated(user=UserOut.model_validate(t), temporary_password=temp)


# -------------------------------------------------------------- consent ---- #
@router.get("/current/consents", response_model=list[ConsentOut])
def consents(user: User = Depends(staff), db: DB = Depends(get_db)) -> list[ConsentRecord]:
    return list(db.scalars(select(ConsentRecord).where(ConsentRecord.school_id == require_school(user))
                           .order_by(ConsentRecord.granted_on.desc())))


@router.post("/current/consents", response_model=ConsentOut, status_code=201)
def consent_add(data: ConsentIn, user: User = Depends(admin_not_demo), db: DB = Depends(get_db)) -> ConsentRecord:
    rec = ConsentRecord(school_id=require_school(user), recorded_by=user.id, **data.model_dump())
    db.add(rec)
    db.flush()
    audit(db, user, "consent.record", "consent", rec.id, user.school_id, {"type": data.consent_type})
    db.commit()
    return rec


@router.post("/current/consents/{consent_id}/revoke", response_model=ConsentOut)
def consent_revoke(consent_id: str, user: User = Depends(admin_not_demo), db: DB = Depends(get_db)) -> ConsentRecord:
    rec = db.get(ConsentRecord, consent_id)
    if not rec or rec.school_id != user.school_id:
        raise NotFound("Consent record not found.")
    if rec.revoked_on is None:
        rec.revoked_on = utcnow()
        audit(db, user, "consent.revoke", "consent", rec.id, user.school_id)
        db.commit()
    return rec


# ------------------------------------------------------------ audit/retention #
@router.get("/current/audit", response_model=list[AuditOut])
def audit_log(limit: int = 100, user: User = Depends(admin), db: DB = Depends(get_db)) -> list[AuditEvent]:
    limit = max(1, min(limit, 500))
    return list(db.scalars(select(AuditEvent).where(AuditEvent.school_id == require_school(user))
                           .order_by(AuditEvent.at.desc()).limit(limit)))


class RetentionResult(BaseModel):
    deleted_sessions: int
    cutoff_days: int


@router.post("/current/retention/apply", response_model=RetentionResult,
             summary="Delete session records older than the school's retention period")
def apply_retention(user: User = Depends(admin_not_demo), db: DB = Depends(get_db)) -> RetentionResult:
    school = db.get(School, require_school(user))
    cutoff = utcnow() - timedelta(days=school.data_retention_days)  # type: ignore[union-attr]
    ids = list(db.scalars(select(Session.id).where(Session.school_id == school.id,  # type: ignore[union-attr]
                                                   Session.started_at < cutoff)))
    if ids:
        db.execute(delete(Session).where(Session.id.in_(ids)))
    audit(db, user, "retention.apply", "school", school.id, school.id,  # type: ignore[union-attr]
          {"deleted_sessions": len(ids)})
    db.commit()
    return RetentionResult(deleted_sessions=len(ids), cutoff_days=school.data_retention_days)  # type: ignore[union-attr]


@router.delete("/current/data", status_code=204,
               summary="Delete ALL learning records for this school (sessions, summaries, progress)")
def delete_all_data(confirm: str, user: User = Depends(admin_not_demo), db: DB = Depends(get_db)) -> Response:
    if confirm != "DELETE":
        raise Conflict("Type DELETE to confirm.", code="confirmation_required")
    sid = require_school(user)
    from app.models import Classroom, GroupProgress, LearningGroup
    group_ids = list(db.scalars(select(LearningGroup.id).join(Classroom).where(Classroom.school_id == sid)))
    db.execute(delete(Session).where(Session.school_id == sid))
    if group_ids:
        db.execute(delete(GroupProgress).where(GroupProgress.group_id.in_(group_ids)))
    audit(db, user, "data.delete_all", "school", sid, sid)
    db.commit()
    return Response(status_code=204)
