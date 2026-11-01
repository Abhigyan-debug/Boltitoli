from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, File, Request, Response, UploadFile
from sqlalchemy.orm import Session as DB

from app.ai.claude_client import ProviderError
from app.api.deps import get_current_user, staff
from app.core.config import get_settings
from app.core.errors import AppError, NotFound, ProviderUnavailable
from app.core.rate_limit import limiter
from app.db.session import SessionLocal, get_db
from app.models import Lesson, LessonQuestion, LessonVersion, User
from app.schemas import TranscriptionOut, TTSIn
from app.services import lesson_service
from app.services.adaptive_service import PHRASES
from app.speech import sarvam
from app.speech.service import SpeechToTextService, TextToSpeechService

router = APIRouter(prefix="/speech", tags=["speech"])
S = get_settings()


@router.get("/status", summary="Which voice features are available right now")
def status(_: User = Depends(get_current_user)) -> dict:
    return {"stt_available": SpeechToTextService.available(), "tts_available": TextToSpeechService.available(),
            "stt_provides_confidence": False, "offline_stt": False,
            "notes": "Speech recognition needs internet. Without it, answers are entered manually."}


@router.post("/transcribe", response_model=TranscriptionOut,
             summary="Transcribe a short spoken answer (audio is not stored)")
@limiter.limit(S.speech_rate_limit)
async def transcribe(request: Request, file: UploadFile = File(...), max_value: int = 100,
                     _: User = Depends(staff)) -> TranscriptionOut:
    data = await file.read(get_settings().max_audio_bytes + 1)
    result = SpeechToTextService().transcribe_answer(data, file.filename or "answer.wav",
                                                     file.content_type or "audio/wav", max_value=max_value)
    del data
    return TranscriptionOut(**result.__dict__)


def resolve_clip(db: DB, ref: str) -> str:
    parts = ref.split(":")
    if len(parts) == 2 and parts[0] == "p" and parts[1] in PHRASES:
        return PHRASES[parts[1]]
    if len(parts) == 3 and parts[0] == "v" and parts[2] == "intro":
        v = db.get(LessonVersion, parts[1])
        if v:
            return v.intro_hi
    if len(parts) == 3 and parts[0] == "q" and parts[2] in ("prompt", "hint", "explanation"):
        q = db.get(LessonQuestion, parts[1])
        if q:
            return {"prompt": q.prompt_hi, "hint": q.hint_hi, "explanation": q.explanation_hi}[parts[2]]
    raise NotFound("Unknown audio clip.", code="unknown_clip")


@router.get("/clip", summary="Hindi audio for approved lesson text (cached)",
            responses={200: {"content": {"audio/mpeg": {}}}})
@limiter.limit(S.speech_rate_limit)
def clip(request: Request, ref: str, _: User = Depends(get_current_user), db: DB = Depends(get_db)) -> Response:
    text = resolve_clip(db, ref)
    key, audio = TextToSpeechService().synthesize(text)
    return Response(audio, media_type="audio/mpeg", headers={"Cache-Control": "private, max-age=2592000",
                                                             "ETag": key})


@router.post("/tts", summary="Speak arbitrary short text (e.g. a summary). Not cached.",
             responses={200: {"content": {"audio/mpeg": {}}}})
@limiter.limit("20/minute")
def tts(request: Request, data: TTSIn, _: User = Depends(staff)) -> Response:
    if not TextToSpeechService.available():
        raise ProviderUnavailable("Hindi voice is not available right now.", code="tts_unavailable")
    try:
        audio = sarvam.synthesize(data.text.strip())
    except ProviderError as e:
        raise ProviderUnavailable("Hindi voice did not respond.", code="tts_unavailable") from e
    return Response(audio, media_type="audio/mpeg", headers={"Cache-Control": "no-store"})


def _prepare_audio(lesson_id: str) -> None:
    from app.api.v1.lessons import clip_texts
    db = SessionLocal()
    try:
        le = db.get(Lesson, lesson_id)
        if not le:
            return
        svc = TextToSpeechService()
        for text in clip_texts(lesson_service.active_version(db, le)).values():
            if not svc.available():
                break
            try:
                svc.synthesize(text)
            except AppError:
                break
    finally:
        db.close()


@router.post("/prepare/{lesson_id}", status_code=202,
             summary="Pre-generate audio for a lesson pack in the background")
def prepare(lesson_id: str, background: BackgroundTasks, _: User = Depends(staff), db: DB = Depends(get_db)) -> dict:
    if not db.get(Lesson, lesson_id):
        raise NotFound("Lesson not found.")
    if not TextToSpeechService.available():
        raise AppError("Hindi voice is not configured, so audio cannot be prepared.", code="tts_unavailable",
                       status_code=503)
    background.add_task(_prepare_audio, lesson_id)
    return {"status": "started"}
