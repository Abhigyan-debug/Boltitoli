"""SpeechToTextService and TextToSpeechService.

Both hide the provider behind a small interface and report honestly when the
provider is not available - they never fabricate a transcript or audio.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path

from app.ai.claude_client import ProviderError
from app.core.config import get_settings
from app.core.errors import AppError, ProviderUnavailable
from app.lesson_engine.hindi_numbers import parse_answer, stt_keyterms
from app.speech import sarvam

ALLOWED_AUDIO = {"audio/wav", "audio/x-wav", "audio/wave", "audio/mpeg", "audio/mp3", "audio/flac",
                 "audio/ogg", "audio/aac"}


@dataclass(frozen=True)
class SpeechAnswer:
    text: str
    value: int | None
    parse_status: str
    confidence: float | None
    usable: bool
    needs_confirmation: bool
    needs_retry: bool
    provider: str


class SpeechToTextService:
    @staticmethod
    def available() -> bool:
        return sarvam.stt_available()

    def transcribe_answer(self, audio: bytes, filename: str, content_type: str,
                          max_value: int = 100) -> SpeechAnswer:
        s = get_settings()
        if len(audio) == 0:
            raise AppError("No audio was received.", code="empty_audio")
        if len(audio) > s.max_audio_bytes:
            raise AppError("Recording is too long. Keep answers under 20 seconds.", code="audio_too_large",
                           status_code=413)
        if content_type.split(";")[0].strip().lower() not in ALLOWED_AUDIO:
            raise AppError("Unsupported audio format. Send 16 kHz mono WAV.", code="unsupported_audio",
                           status_code=415)
        if not self.available():
            raise ProviderUnavailable("Speech recognition is not available right now. Use manual entry.",
                                      code="stt_unavailable")
        try:
            tr = sarvam.transcribe(audio, filename, content_type, keyterms=stt_keyterms(min(max_value, 20)))
        except ProviderError as e:
            raise ProviderUnavailable("Speech recognition did not respond. Use manual entry or try again.",
                                      code="stt_unavailable", details={"reason": e.code}) from e

        parsed = parse_answer(tr.text)
        conf = tr.confidence
        usable = parsed.status == "ok"
        # Without a provider confidence we never auto-accept: a human confirms.
        needs_confirmation = usable and (conf is None or conf < s.stt_min_confidence)
        return SpeechAnswer(text=tr.text, value=parsed.value, parse_status=parsed.status, confidence=conf,
                            usable=usable, needs_confirmation=needs_confirmation, needs_retry=not usable,
                            provider=tr.provider)


class TextToSpeechService:
    @staticmethod
    def available() -> bool:
        return sarvam.tts_available()

    @staticmethod
    def cache_key(text: str) -> str:
        s = get_settings()
        raw = f"{s.sarvam_tts_model}|{s.sarvam_tts_speaker}|{s.sarvam_tts_pace}|{text}"
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]

    def _path(self, key: str) -> Path:
        d = Path(get_settings().tts_cache_dir)
        d.mkdir(parents=True, exist_ok=True)
        return d / f"{key}.mp3"

    def cached(self, key: str) -> bytes | None:
        p = self._path(key)
        return p.read_bytes() if p.exists() else None

    def synthesize(self, text: str) -> tuple[str, bytes]:
        """Return (cache_key, mp3 bytes). Only lesson/summary text reaches here."""
        s = get_settings()
        text = text.strip()
        if not text:
            raise AppError("Nothing to speak.", code="empty_text")
        if len(text) > s.tts_max_chars:
            raise AppError("Text is too long to speak in one go.", code="text_too_long")
        key = self.cache_key(text)
        hit = self.cached(key)
        if hit:
            return key, hit
        if not self.available():
            raise ProviderUnavailable("Hindi voice is not available right now.", code="tts_unavailable")
        try:
            audio = sarvam.synthesize(text)
        except ProviderError as e:
            raise ProviderUnavailable("Hindi voice did not respond.", code="tts_unavailable",
                                      details={"reason": e.code}) from e
        self._path(key).write_bytes(audio)
        return key, audio
