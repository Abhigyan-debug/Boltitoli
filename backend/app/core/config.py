"""Application configuration loaded from environment variables.

All provider credentials live here and only here. Nothing in this module is
ever sent to the browser.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- Core ---
    environment: Literal["development", "test", "production"] = "development"
    app_name: str = "BoltiToli API"
    database_url: str = "sqlite:///./boltitoli.db"
    # NoDecode: hand "a,b" to _split_origins as text instead of JSON-decoding it first (which fails)
    cors_origins: Annotated[list[str], NoDecode] = Field(default_factory=lambda: ["http://localhost:5173"])
    log_level: str = "INFO"

    # --- Auth ---
    jwt_secret: str = "dev-only-change-me-dev-only-change-me"
    jwt_algorithm: str = "HS256"
    bcrypt_rounds: int = 12
    access_token_minutes: int = 15
    refresh_token_days: int = 14
    refresh_cookie_name: str = "bt_refresh"
    refresh_cookie_secure: bool = False
    refresh_cookie_samesite: Literal["lax", "strict", "none"] = "lax"
    refresh_cookie_path: str = "/api/v1/auth"

    # --- Rate limiting ---
    rate_limit_enabled: bool = True
    auth_rate_limit: str = "10/minute"
    speech_rate_limit: str = "60/minute"
    # proxies in front of the API that append to X-Forwarded-For (Render = 1, Vercel + Render = 2)
    trusted_proxy_hops: int = Field(default=0, ge=0, le=5)

    # --- Claude (Anthropic) ---
    anthropic_api_key: str | None = None
    anthropic_base_url: str = "https://api.anthropic.com"
    anthropic_model_summary: str = "claude-sonnet-5-5"
    anthropic_model_feedback: str = "claude-haiku-5-5"
    anthropic_timeout_seconds: float = 12.0
    anthropic_feedback_timeout_seconds: float = 4.0

    # --- Sarvam ---
    sarvam_api_key: str | None = None
    sarvam_base_url: str = "https://api.sarvam.ai"
    sarvam_stt_model: str = "saaras:v4"
    sarvam_tts_model: str = "bulbul:v3"
    sarvam_tts_speaker: str = "priya"
    sarvam_tts_pace: float = 0.9
    sarvam_timeout_seconds: float = 10.0

    # --- Speech handling ---
    # Sarvam STT returns no confidence score, so voice answers without a
    # provider confidence must be confirmed by the teacher/leader.
    stt_min_confidence: float = 0.75
    max_audio_bytes: int = 1_500_000  # ~45 s of 16 kHz mono WAV; STT limit is 30 s
    tts_cache_dir: str = "./.cache/tts"
    tts_max_chars: int = 600

    # --- Product ---
    demo_mode_enabled: bool = True
    data_retention_days: int = 730

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, v: object) -> object:
        if isinstance(v, str) and not v.strip().startswith("["):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v

    @property
    def claude_enabled(self) -> bool:
        return bool(self.anthropic_api_key)

    @property
    def sarvam_enabled(self) -> bool:
        return bool(self.sarvam_api_key)

    def validate_for_production(self) -> list[str]:
        problems: list[str] = []
        if self.environment == "production":
            if "dev-only" in self.jwt_secret or len(self.jwt_secret) < 32:
                problems.append("JWT_SECRET must be a random value of at least 32 characters")
            if self.database_url.startswith("sqlite"):
                problems.append("DATABASE_URL should point to PostgreSQL in production")
            if not self.refresh_cookie_secure:
                problems.append("REFRESH_COOKIE_SECURE must be true in production")
        return problems


@lru_cache
def get_settings() -> Settings:
    return Settings()
