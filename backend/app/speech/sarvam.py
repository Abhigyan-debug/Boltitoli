"""Sarvam speech providers.

STT:  POST {base}/speech-to-text   multipart: file, model, mode[, keyterms]
      -> {"request_id", "transcript", "language_code"}   (no confidence score)
TTS:  POST {base}/text-to-speech   json: text, language_code, speaker, model, pace,
      speech_sample_rate, output_audio_codec  -> {"audios": [base64...]}

Audio is processed in memory and never written to disk or logged.
"""

from __future__ import annotations

import base64
import json
import logging
import time
from dataclasses import dataclass

import httpx

from app.ai.claude_client import ProviderError
from app.ai.health import health
from app.core.config import get_settings

log = logging.getLogger("boltitoli.speech.sarvam")
STT, TTS = "sarvam_stt", "sarvam_tts"
RETRYABLE = {429, 500, 502, 503, 504}


@dataclass(frozen=True)
class Transcript:
    text: str
    language_code: str | None
    confidence: float | None  # Sarvam does not return one today
    provider: str = "sarvam"


def stt_available() -> bool:
    health.register(STT, get_settings().sarvam_enabled)
    return health.available(STT)


def tts_available() -> bool:
    health.register(TTS, get_settings().sarvam_enabled)
    return health.available(TTS)


def _post(provider: str, url: str, *, timeout: float, retries: int = 1, **kwargs) -> httpx.Response:
    s = get_settings()
    headers = {"api-subscription-key": s.sarvam_api_key or ""}
    code = "unknown"
    for attempt in range(retries + 1):
        try:
            resp = httpx.post(url, headers=headers, timeout=timeout, **kwargs)
        except httpx.TimeoutException:
            code = "timeout"
        except httpx.HTTPError:
            code = "network_error"
        else:
            if resp.status_code == 200:
                health.ok(provider)
                return resp
            code = f"http_{resp.status_code}"
            if resp.status_code not in RETRYABLE:
                break
        if attempt < retries:
            time.sleep(0.3 * (attempt + 1))
    health.fail(provider, code)
    log.warning("sarvam_call_failed", extra={"provider": provider, "code": code})
    raise ProviderError(code)


def transcribe(audio: bytes, filename: str, content_type: str, keyterms: list[str] | None = None) -> Transcript:
    s = get_settings()
    if not stt_available():
        raise ProviderError("unavailable")
    data = {"model": s.sarvam_stt_model, "mode": "transcribe"}
    if keyterms and s.sarvam_stt_model.endswith("v4"):
        data["keyterms"] = json.dumps(keyterms[:50], ensure_ascii=False)
    resp = _post(STT, f"{s.sarvam_base_url}/speech-to-text", timeout=s.sarvam_timeout_seconds,
                 files={"file": (filename, audio, content_type)}, data=data)
    body = resp.json()
    return Transcript(text=(body.get("transcript") or "").strip(), language_code=body.get("language_code"),
                      confidence=None)


def synthesize(text: str) -> bytes:
    s = get_settings()
    if not tts_available():
        raise ProviderError("unavailable")
    payload = {
        "text": text,
        "language_code": "hi-IN",
        "speaker": s.sarvam_tts_speaker,
        "model": s.sarvam_tts_model,
        "pace": s.sarvam_tts_pace,
        "speech_sample_rate": 22050,
        "output_audio_codec": "mp3",
    }
    resp = _post(TTS, f"{s.sarvam_base_url}/text-to-speech", timeout=s.sarvam_timeout_seconds, json=payload)
    audios = resp.json().get("audios") or []
    if not audios:
        health.fail(TTS, "empty_audio")
        raise ProviderError("empty_audio")
    return base64.b64decode(audios[0])
