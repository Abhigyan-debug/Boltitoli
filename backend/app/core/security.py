"""Password hashing and JWT helpers."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import bcrypt
import jwt

from app.core.config import get_settings


def hash_password(password: str) -> str:
    # bcrypt only uses the first 72 bytes; schemas cap length at 72 bytes.
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=get_settings().bcrypt_rounds)).decode("ascii")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("ascii"))
    except ValueError:
        return False


def _encode(claims: dict[str, Any], expires: timedelta) -> str:
    s = get_settings()
    now = datetime.now(UTC)
    payload = {**claims, "iat": now, "exp": now + expires}
    return jwt.encode(payload, s.jwt_secret, algorithm=s.jwt_algorithm)


def create_access_token(user_id: str, role: str) -> str:
    s = get_settings()
    return _encode({"sub": user_id, "role": role, "typ": "access"}, timedelta(minutes=s.access_token_minutes))


def create_refresh_token(user_id: str) -> tuple[str, str, datetime]:
    s = get_settings()
    jti = uuid.uuid4().hex
    expires = timedelta(days=s.refresh_token_days)
    token = _encode({"sub": user_id, "typ": "refresh", "jti": jti}, expires)
    return token, jti, datetime.now(UTC) + expires


def decode_token(token: str, expected_type: str) -> dict[str, Any]:
    s = get_settings()
    payload = jwt.decode(token, s.jwt_secret, algorithms=[s.jwt_algorithm], options={"require": ["exp", "sub"]})
    if payload.get("typ") != expected_type:
        raise jwt.InvalidTokenError("wrong token type")
    return payload
