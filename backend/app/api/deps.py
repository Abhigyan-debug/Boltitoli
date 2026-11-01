from __future__ import annotations

from collections.abc import Callable

import jwt
from fastapi import Depends, Header
from sqlalchemy.orm import Session as DB

from app.core.errors import Forbidden, Unauthorized
from app.core.security import decode_token
from app.db.session import get_db
from app.models import School, User


def get_current_user(authorization: str | None = Header(default=None), db: DB = Depends(get_db)) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise Unauthorized("Please log in.", code="not_authenticated")
    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = decode_token(token, "access")
    except jwt.ExpiredSignatureError as e:
        raise Unauthorized("Your session has expired.", code="token_expired") from e
    except jwt.InvalidTokenError as e:
        raise Unauthorized("Invalid credentials.", code="invalid_token") from e
    user = db.get(User, payload["sub"])
    if not user or not user.is_active:
        raise Unauthorized("Account not found or disabled.", code="invalid_token")
    return user


def require_roles(*roles: str) -> Callable[[User], User]:
    def _dep(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise Forbidden("You do not have permission to do this.")
        return user
    return _dep


# School staff can manage their own school's classrooms, groups and sessions.
staff = require_roles("teacher", "school_admin")
admin = require_roles("school_admin")


def _not_demo(base: Callable[..., User]) -> Callable[..., User]:
    """Wrap a role check so visitors of the shared, public demo school cannot change school-wide
    or shared data (staff, retention, deletion, profile/password, the global lesson library)."""
    def _dep(user: User = Depends(base), db: DB = Depends(get_db)) -> User:
        school = db.get(School, user.school_id) if user.school_id else None
        if school is not None and school.is_demo:
            raise Forbidden("Not available in the demo school.", code="demo_read_only")
        return user
    return _dep


staff_not_demo = _not_demo(staff)
admin_not_demo = _not_demo(admin)
user_not_demo = _not_demo(get_current_user)
