"""LessonService: lesson library, versions, review, lesson packs and seeding."""

from __future__ import annotations

import json
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session as DB

from app.core.errors import AppError, Forbidden, NotFound
from app.db.base import utcnow
from app.lesson_engine.engine import Question
from app.models import Lesson, LessonQuestion, LessonVersion, Skill, User
from app.services.access import audit

CONTENT = Path(__file__).resolve().parents[1] / "lesson_engine" / "content" / "lessons.json"


def seed_library(db: DB) -> int:
    """Idempotently load the starter skills and lesson drafts. Returns lessons created."""
    data = json.loads(CONTENT.read_text(encoding="utf-8"))
    created = 0
    for item in data:
        sk = item["skill"]
        skill = db.scalar(select(Skill).where(Skill.code == sk["code"]))
        if not skill:
            skill = Skill(**sk)
            db.add(skill)
            db.flush()
        le = item["lesson"]
        if db.scalar(select(Lesson).where(Lesson.code == le["code"])):
            continue
        lesson = Lesson(skill_id=skill.id, code=le["code"], title_hi=le["title_hi"], title_en=le["title_en"])
        db.add(lesson)
        db.flush()
        ver = LessonVersion(lesson_id=lesson.id, version=1, status="draft", source="authored",
                            objective_hi=le["objective_hi"], intro_hi=le["intro_hi"],
                            completion_criteria=le["completion_criteria"])
        db.add(ver)
        db.flush()
        for q in le["questions"]:
            db.add(LessonQuestion(version_id=ver.id, **q))
        # Usable straight away, but labelled "draft - teacher review pending" everywhere.
        lesson.published_version_id = ver.id
        created += 1
    db.commit()
    return created


def lesson_for_skill(db: DB, skill_id: str) -> Lesson:
    lesson = db.scalar(select(Lesson).where(Lesson.skill_id == skill_id).order_by(Lesson.created_at))
    if not lesson:
        raise NotFound("No lesson exists for this skill yet.", code="no_lesson")
    return lesson


def active_version(db: DB, lesson: Lesson) -> LessonVersion:
    if lesson.published_version_id:
        v = db.get(LessonVersion, lesson.published_version_id)
        if v:
            return v
    if lesson.versions:
        return lesson.versions[-1]
    raise NotFound("This lesson has no content yet.", code="no_lesson_version")


def engine_questions(version: LessonVersion) -> list[Question]:
    return [Question(q.id, q.difficulty, q.kind, q.operands, q.expected_answer) for q in version.questions]


def question_count(db: DB, version_id: str) -> int:
    return db.scalar(select(func.count()).select_from(LessonQuestion)
                     .where(LessonQuestion.version_id == version_id)) or 0


def mark_reviewed(db: DB, user: User, lesson: Lesson, version_id: str, note: str | None) -> LessonVersion:
    if user.role not in ("teacher", "school_admin"):
        raise Forbidden("Only teachers can review lessons.")
    v = db.get(LessonVersion, version_id)
    if not v or v.lesson_id != lesson.id:
        raise NotFound("Lesson version not found.")
    if v.status == "reviewed":
        return v
    if not v.questions:
        raise AppError("A lesson without questions cannot be reviewed.", code="empty_lesson")
    v.status = "reviewed"
    v.reviewed_by_id = user.id
    v.reviewed_at = utcnow()
    v.review_note = note
    lesson.published_version_id = v.id
    audit(db, user, "lesson.review", "lesson_version", v.id, user.school_id,
          {"lesson": lesson.code, "version": v.version})
    db.commit()
    return v


def create_draft_version(db: DB, user: User, lesson: Lesson, new_questions: list[dict], source: str) -> LessonVersion:
    base = active_version(db, lesson)
    latest = max(v.version for v in lesson.versions)
    ver = LessonVersion(lesson_id=lesson.id, version=latest + 1, status="draft", source=source,
                        objective_hi=base.objective_hi, intro_hi=base.intro_hi,
                        completion_criteria=dict(base.completion_criteria))
    db.add(ver)
    db.flush()
    pos = 0
    for q in base.questions:
        db.add(LessonQuestion(version_id=ver.id, position=pos, difficulty=q.difficulty, kind=q.kind,
                              prompt_hi=q.prompt_hi, prompt_en=q.prompt_en, operands=dict(q.operands),
                              expected_answer=q.expected_answer, hint_hi=q.hint_hi,
                              explanation_hi=q.explanation_hi, visual=q.visual))
        pos += 1
    for q in new_questions:
        db.add(LessonQuestion(version_id=ver.id, position=pos, **q))
        pos += 1
    audit(db, user, "lesson.draft_created", "lesson_version", ver.id, user.school_id,
          {"lesson": lesson.code, "source": source, "added": len(new_questions)})
    db.commit()
    db.refresh(ver)
    return ver
