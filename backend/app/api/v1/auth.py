from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session as DB

from app.api.deps import get_current_user, user_not_demo
from app.core.config import get_settings
from app.core.errors import AppError, Unauthorized
from app.core.rate_limit import limiter
from app.core.security import hash_password, verify_password
from app.db.session import get_db
from app.models import User
from app.schemas import LoginIn, PasswordChangeIn, RegisterIn, TokenOut, UserOut, UserUpdateIn
from app.services import auth_service
from app.services.access import audit

router = APIRouter(prefix="/auth", tags=["auth"])
S = get_settings()


def _set_cookie(resp: Response, token: str, expires: datetime) -> None:
    s = get_settings()
    resp.set_cookie(s.refresh_cookie_name, token, httponly=True, secure=s.refresh_cookie_secure,
                    samesite=s.refresh_cookie_samesite, path=s.refresh_cookie_path, expires=expires)


def _token_out(access: str, user: User) -> TokenOut:
    return TokenOut(access_token=access, expires_in=get_settings().access_token_minutes * 60,
                    user=UserOut.model_validate(user))


@router.post("/register", response_model=TokenOut, status_code=201,
             summary="Create a teacher account and a new school")
@limiter.limit(S.auth_rate_limit)
def register(request: Request, response: Response, data: RegisterIn, db: DB = Depends(get_db)) -> TokenOut:
    user = auth_service.register(db, data)
    access, refresh, exp = auth_service.issue_tokens(db, user)
    _set_cookie(response, refresh, exp)
    return _token_out(access, user)


@router.post("/login", response_model=TokenOut, summary="Log in with email and password")
@limiter.limit(S.auth_rate_limit)
def login(request: Request, response: Response, data: LoginIn, db: DB = Depends(get_db)) -> TokenOut:
    user = auth_service.authenticate(db, data.email, data.password)
    access, refresh, exp = auth_service.issue_tokens(db, user)
    _set_cookie(response, refresh, exp)
    return _token_out(access, user)


@router.post("/demo", response_model=TokenOut, summary="Log in to the labelled demo school (if enabled)")
@limiter.limit(S.auth_rate_limit)
def demo(request: Request, response: Response, db: DB = Depends(get_db)) -> TokenOut:
    if not get_settings().demo_mode_enabled:
        raise AppError("Demo mode is disabled on this server.", code="demo_disabled", status_code=404)
    from app.cli import seed_demo
    user = seed_demo(db)
    access, refresh, exp = auth_service.issue_tokens(db, user)
    _set_cookie(response, refresh, exp)
    return _token_out(access, user)


@router.post("/refresh", response_model=TokenOut, summary="Rotate the refresh cookie and get a new access token")
@limiter.limit("30/minute")
def refresh(request: Request, response: Response, db: DB = Depends(get_db)) -> TokenOut:
    token = request.cookies.get(get_settings().refresh_cookie_name)
    try:
        user, access, new_refresh, exp = auth_service.rotate_refresh(db, token)
    except Unauthorized:
        response.delete_cookie(get_settings().refresh_cookie_name, path=get_settings().refresh_cookie_path)
        raise
    _set_cookie(response, new_refresh, exp)
    return _token_out(access, user)


@router.post("/logout", status_code=204, summary="Revoke the refresh token")
def logout(request: Request, response: Response, db: DB = Depends(get_db)) -> Response:
    s = get_settings()
    auth_service.revoke(db, request.cookies.get(s.refresh_cookie_name))
    response = Response(status_code=204)
    response.delete_cookie(s.refresh_cookie_name, path=s.refresh_cookie_path)
    return response


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> User:
    return user


@router.patch("/me", response_model=UserOut)
def update_me(data: UserUpdateIn, user: User = Depends(user_not_demo), db: DB = Depends(get_db)) -> User:
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(user, k, v)
    db.commit()
    db.refresh(user)
    return user


@router.post("/change-password", status_code=204)
def change_password(data: PasswordChangeIn, user: User = Depends(user_not_demo),
                    db: DB = Depends(get_db)) -> Response:
    if not verify_password(data.current_password, user.password_hash):
        raise AppError("Current password is incorrect.", code="wrong_password")
    user.password_hash = hash_password(data.new_password)
    audit(db, user, "user.password_change", "user", user.id, user.school_id)
    db.commit()
    auth_service.revoke_all(db, user.id)
    return Response(status_code=204)
