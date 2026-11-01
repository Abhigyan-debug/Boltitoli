from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session as DB

from app.api.deps import staff
from app.core.errors import AppError
from app.db.base import utcnow
from app.db.session import get_db
from app.models import Classroom, LearningGroup, Session, Skill, User
from app.schemas import ClassroomIn, ClassroomOut, ClassroomUpdate, GroupIn, GroupOut, GroupUpdate
from app.services.access import audit, get_classroom, get_group, require_school

router = APIRouter(tags=["classrooms & groups"])


def _classroom_out(db: DB, c: Classroom) -> ClassroomOut:
    n = db.scalar(select(func.count()).select_from(LearningGroup)
                  .where(LearningGroup.classroom_id == c.id, LearningGroup.archived_at.is_(None))) or 0
    out = ClassroomOut.model_validate(c)
    out.group_count = n
    return out


@router.get("/classrooms", response_model=list[ClassroomOut])
def list_classrooms(include_archived: bool = False, user: User = Depends(staff),
                    db: DB = Depends(get_db)) -> list[ClassroomOut]:
    q = select(Classroom).where(Classroom.school_id == require_school(user)).order_by(Classroom.created_at)
    if not include_archived:
        q = q.where(Classroom.archived_at.is_(None))
    return [_classroom_out(db, c) for c in db.scalars(q)]


@router.post("/classrooms", response_model=ClassroomOut, status_code=201)
def create_classroom(data: ClassroomIn, user: User = Depends(staff), db: DB = Depends(get_db)) -> ClassroomOut:
    c = Classroom(school_id=require_school(user), name=data.name.strip(), grades=data.grades, created_by=user.id)
    db.add(c)
    db.flush()
    audit(db, user, "classroom.create", "classroom", c.id, c.school_id)
    db.commit()
    return _classroom_out(db, c)


@router.patch("/classrooms/{classroom_id}", response_model=ClassroomOut)
def update_classroom(classroom_id: str, data: ClassroomUpdate, user: User = Depends(staff),
                     db: DB = Depends(get_db)) -> ClassroomOut:
    c = get_classroom(db, user, classroom_id)
    changes = data.model_dump(exclude_unset=True)
    if "archived" in changes:
        c.archived_at = utcnow() if changes.pop("archived") else None
    for k, v in changes.items():
        setattr(c, k, v)
    audit(db, user, "classroom.update", "classroom", c.id, c.school_id, {"fields": sorted(data.model_fields_set)})
    db.commit()
    return _classroom_out(db, c)


# ------------------------------------------------------------------ groups -- #
def _group_out(db: DB, g: LearningGroup) -> GroupOut:
    out = GroupOut.model_validate(g)
    out.sessions_count = db.scalar(select(func.count()).select_from(Session)
                                   .where(Session.group_id == g.id, Session.status == "completed")) or 0
    out.last_session_at = db.scalar(select(func.max(Session.started_at))
                                    .where(Session.group_id == g.id, Session.status == "completed"))
    return out


def _check_skill(db: DB, skill_id: str | None) -> None:
    if skill_id and not db.get(Skill, skill_id):
        raise AppError("Unknown skill.", code="unknown_skill", status_code=422)


@router.get("/groups", response_model=list[GroupOut])
def list_groups(classroom_id: str | None = None, include_archived: bool = False, user: User = Depends(staff),
                db: DB = Depends(get_db)) -> list[GroupOut]:
    q = (select(LearningGroup).join(Classroom).where(Classroom.school_id == require_school(user))
         .order_by(LearningGroup.created_at))
    if classroom_id:
        q = q.where(LearningGroup.classroom_id == classroom_id)
    if not include_archived:
        q = q.where(LearningGroup.archived_at.is_(None), Classroom.archived_at.is_(None))
    return [_group_out(db, g) for g in db.scalars(q)]


@router.get("/groups/{group_id}", response_model=GroupOut)
def get_one(group_id: str, user: User = Depends(staff), db: DB = Depends(get_db)) -> GroupOut:
    return _group_out(db, get_group(db, user, group_id))


@router.post("/groups", response_model=GroupOut, status_code=201)
def create_group(data: GroupIn, user: User = Depends(staff), db: DB = Depends(get_db)) -> GroupOut:
    c = get_classroom(db, user, data.classroom_id)
    _check_skill(db, data.current_skill_id)
    g = LearningGroup(classroom_id=c.id, name=data.name.strip(), level=data.level, size=data.size,
                      leader_label=(data.leader_label or None), current_skill_id=data.current_skill_id)
    db.add(g)
    db.flush()
    audit(db, user, "group.create", "group", g.id, c.school_id)
    db.commit()
    db.refresh(g)
    return _group_out(db, g)


@router.patch("/groups/{group_id}", response_model=GroupOut)
def update_group(group_id: str, data: GroupUpdate, user: User = Depends(staff), db: DB = Depends(get_db)) -> GroupOut:
    g = get_group(db, user, group_id)
    changes = data.model_dump(exclude_unset=True)
    _check_skill(db, changes.get("current_skill_id"))
    meta = {"fields": sorted(changes)}
    if "level" in changes and changes["level"] != g.level:
        meta["level_from"], meta["level_to"] = g.level, changes["level"]
    if "archived" in changes:
        g.archived_at = utcnow() if changes.pop("archived") else None
    for k, v in changes.items():
        setattr(g, k, v)
    audit(db, user, "group.update", "group", g.id, g.classroom.school_id, meta)
    db.commit()
    db.refresh(g)
    return _group_out(db, g)
