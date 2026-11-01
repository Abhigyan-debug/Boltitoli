from __future__ import annotations

from datetime import UTC, datetime

import jwt
from sqlalchemy import select, update
from sqlalchemy.orm import Session as DB

from app.core.config import get_settings
from app.core.errors import Conflict, Unauthorized
from app.core.security import create_access_token, create_refresh_token, decode_token, hash_password, verify_password
from app.db.base import as_utc, utcnow
from app.models import RefreshToken, School, User
from app.schemas import RegisterIn
from app.services.access import audit

# Constant-time-ish defence against user enumeration on login.
_DUMMY_HASH = hash_password("not-a-real-password-1")


def register(db: DB, data: RegisterIn) -> User:
    email = data.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise Conflict("An account with this email already exists.", code="email_taken")
    school = School(name=data.school.name.strip(), udise_code=data.school.udise_code,
                    district=data.school.district, block=data.school.block,
                    data_retention_days=get_settings().data_retention_days)
    db.add(school)
    db.flush()
    # The first teacher of a new school administers it.
    user = User(email=email, password_hash=hash_password(data.password), full_name=data.full_name.strip(),
                role="school_admin", school_id=school.id)
    db.add(user)
    db.flush()
    audit(db, user, "user.register", "user", user.id, school.id)
    db.commit()
    return user


def authenticate(db: DB, email: str, password: str) -> User:
    user = db.scalar(select(User).where(User.email == email.lower()))
    if not user:
        verify_password(password, _DUMMY_HASH)
        raise Unauthorized("Email or password is incorrect.", code="invalid_credentials")
    if not verify_password(password, user.password_hash) or not user.is_active:
        raise Unauthorized("Email or password is incorrect.", code="invalid_credentials")
    return user


def issue_tokens(db: DB, user: User) -> tuple[str, str, datetime]:
    access = create_access_token(user.id, user.role)
    refresh, jti, expires = create_refresh_token(user.id)
    db.add(RefreshToken(jti=jti, user_id=user.id, expires_at=expires))
    db.commit()
    return access, refresh, expires


def rotate_refresh(db: DB, token: str | None) -> tuple[User, str, str, datetime]:
    if not token:
        raise Unauthorized("Please log in again.", code="no_refresh_token")
    try:
        payload = decode_token(token, "refresh")
    except jwt.InvalidTokenError as e:
        raise Unauthorized("Please log in again.", code="invalid_refresh_token") from e
    row = db.get(RefreshToken, payload.get("jti", ""))
    if row is None:
        raise Unauthorized("Please log in again.", code="invalid_refresh_token")
    if row.revoked_at is not None:
        # Reuse of a rotated token: assume theft, revoke every session for this user.
        revoke_all(db, row.user_id)
        raise Unauthorized("Please log in again.", code="refresh_token_reused")
    if as_utc(row.expires_at) < datetime.now(UTC):
        raise Unauthorized("Please log in again.", code="refresh_token_expired")
    user = db.get(User, row.user_id)
    if not user or not user.is_active:
        raise Unauthorized("Please log in again.", code="invalid_refresh_token")
    row.revoked_at = utcnow()
    access, refresh, expires = issue_tokens(db, user)
    return user, access, refresh, expires


def revoke(db: DB, token: str | None) -> None:
    if not token:
        return
    try:
        payload = decode_token(token, "refresh")
    except jwt.InvalidTokenError:
        return
    row = db.get(RefreshToken, payload.get("jti", ""))
    if row and row.revoked_at is None:
        row.revoked_at = utcnow()
        db.commit()


def revoke_all(db: DB, user_id: str) -> None:
    db.execute(update(RefreshToken).where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
               .values(revoked_at=utcnow()))
    db.commit()
