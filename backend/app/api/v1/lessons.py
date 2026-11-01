from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session as DB

from app.api.deps import get_current_user, staff_not_demo
from app.core.errors import NotFound
from app.core.rate_limit import limiter
from app.db.base import utcnow
from app.db.session import get_db
from app.models import Lesson, LessonVersion, Skill, User
from app.schemas import (
    DraftQuestionsIn,
    LessonDetailOut,
    LessonOut,
    LessonPackOut,
    LessonVersionOut,
    QuestionOut,
    ReviewIn,
    SkillOut,
)
from app.services import draft_service, lesson_service
from app.services.adaptive_service import PHRASES
from app.speech.service import TextToSpeechService

router = APIRouter(tags=["lessons"])


def version_out(db: DB, v: LessonVersion | None) -> LessonVersionOut | None:
    if v is None:
        return None
    out = LessonVersionOut.model_validate(v)
    out.question_count = len(v.questions)
    if v.reviewed_by_id:
        u = db.get(User, v.reviewed_by_id)
        out.reviewed_by_name = u.full_name if u else None
    return out


def lesson_out(db: DB, lesson: Lesson, cls=LessonOut):
    published = db.get(LessonVersion, lesson.published_version_id) if lesson.published_version_id else None
    latest = lesson.versions[-1] if lesson.versions else None
    return cls(id=lesson.id, code=lesson.code, title_hi=lesson.title_hi, title_en=lesson.title_en,
               skill=SkillOut.model_validate(lesson.skill), published_version=version_out(db, published),
               latest_version=version_out(db, latest))


@router.get("/skills", response_model=list[SkillOut], summary="Skill progression (beginner → advancing)")
def skills(level: str | None = None, _: User = Depends(get_current_user), db: DB = Depends(get_db)) -> list[Skill]:
    q = select(Skill).order_by(Skill.sort_order)
    if level:
        q = q.where(Skill.level == level)
    return list(db.scalars(q))


@router.get("/lessons", response_model=list[LessonOut])
def list_lessons(_: User = Depends(get_current_user), db: DB = Depends(get_db)) -> list[LessonOut]:
    lessons = db.scalars(select(Lesson).join(Skill).order_by(Skill.sort_order))
    return [lesson_out(db, le) for le in lessons]


def _lesson(db: DB, lesson_id: str) -> Lesson:
    le = db.get(Lesson, lesson_id)
    if not le:
        raise NotFound("Lesson not found.")
    return le


@router.get("/lessons/{lesson_id}", response_model=LessonDetailOut)
def get_lesson(lesson_id: str, version_id: str | None = None, _: User = Depends(get_current_user),
               db: DB = Depends(get_db)) -> LessonDetailOut:
    le = _lesson(db, lesson_id)
    out = lesson_out(db, le, LessonDetailOut)
    v = db.get(LessonVersion, version_id) if version_id else lesson_service.active_version(db, le)
    if not v or v.lesson_id != le.id:
        raise NotFound("Lesson version not found.")
    out.questions = [QuestionOut.model_validate(q) for q in v.questions]
    return out


@router.get("/lessons/{lesson_id}/versions", response_model=list[LessonVersionOut])
def versions(lesson_id: str, _: User = Depends(get_current_user), db: DB = Depends(get_db)) -> list:
    return [version_out(db, v) for v in _lesson(db, lesson_id).versions]


@router.post("/lessons/{lesson_id}/review", response_model=LessonVersionOut,
             summary="Mark a lesson version as reviewed by the current teacher and publish it")
def review(lesson_id: str, data: ReviewIn, user: User = Depends(staff_not_demo), db: DB = Depends(get_db)):
    le = _lesson(db, lesson_id)
    return version_out(db, lesson_service.mark_reviewed(db, user, le, data.version_id, data.note))


@router.post("/lessons/{lesson_id}/draft-questions", response_model=LessonVersionOut, status_code=201,
             summary="Ask Claude to draft extra questions into a new DRAFT version (teacher review required)")
@limiter.limit("5/minute")  # each call is a large Claude request
def draft(request: Request, lesson_id: str, data: DraftQuestionsIn, user: User = Depends(staff_not_demo),
          db: DB = Depends(get_db)):
    le = _lesson(db, lesson_id)
    return version_out(db, draft_service.draft_questions(db, user, le, data.count, data.difficulty))


# --------------------------------------------------------------- packs ---- #
def clip_texts(v: LessonVersion) -> dict[str, str]:
    """All speakable text in a lesson pack, keyed by clip ref."""
    clips = {f"v:{v.id}:intro": v.intro_hi}
    for q in v.questions:
        clips[f"q:{q.id}:prompt"] = q.prompt_hi
        clips[f"q:{q.id}:hint"] = q.hint_hi
        clips[f"q:{q.id}:explanation"] = q.explanation_hi
    for k, t in PHRASES.items():
        clips[f"p:{k}"] = t
    return clips


def build_pack(db: DB, le: Lesson) -> LessonPackOut:
    v = lesson_service.active_version(db, le)
    tts = TextToSpeechService()
    clips = clip_texts(v)
    audio = {ref: f"/api/v1/speech/clip?ref={ref}" for ref, text in clips.items()
             if tts.cached(tts.cache_key(text))}
    status = "included" if len(audio) == len(clips) else ("partial" if audio else "unavailable")
    return LessonPackOut(pack_id=f"{le.code}@{v.version}", lesson_id=le.id, lesson_code=le.code, version_id=v.id,
                         version=v.version, status=v.status, skill=SkillOut.model_validate(le.skill),
                         title_hi=le.title_hi, objective_hi=v.objective_hi, intro_hi=v.intro_hi,
                         completion_criteria=v.completion_criteria,
                         questions=[QuestionOut.model_validate(q) for q in v.questions], audio=audio,
                         audio_status=status, built_at=utcnow())


@router.get("/lesson-packs", response_model=list[dict], summary="Index of downloadable, versioned lesson packs")
def pack_index(_: User = Depends(get_current_user), db: DB = Depends(get_db)) -> list[dict]:
    out = []
    for le in db.scalars(select(Lesson).join(Skill).order_by(Skill.sort_order)):
        v = lesson_service.active_version(db, le)
        out.append({"lesson_id": le.id, "pack_id": f"{le.code}@{v.version}", "version_id": v.id,
                    "version": v.version, "status": v.status, "skill_id": le.skill_id, "title_hi": le.title_hi,
                    "title_en": le.title_en, "question_count": len(v.questions)})
    return out


@router.get("/lesson-packs/{lesson_id}", response_model=LessonPackOut)
def pack(lesson_id: str, _: User = Depends(get_current_user), db: DB = Depends(get_db)) -> LessonPackOut:
    return build_pack(db, _lesson(db, lesson_id))
