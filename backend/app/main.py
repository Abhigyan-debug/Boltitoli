from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.api.v1 import auth, classrooms, lessons, misc, schools, sessions, speech
from app.core.config import get_settings
from app.core.errors import install_error_handlers
from app.core.logging import RequestLogMiddleware, configure_logging
from app.core.rate_limit import limiter

DESCRIPTION = """
BoltiToli is a Hindi voice helper that runs a 15-minute guided maths practice
session for one group of children while the teacher works with another group.

* Correctness and progression are decided by a deterministic lesson engine.
* Claude (optional) writes teacher summaries and explanations, validated against session data.
* Sarvam (optional) provides Hindi speech recognition and speech synthesis.
* Raw audio is never stored. Groups are pseudonymous.
"""


def create_app() -> FastAPI:
    s = get_settings()
    configure_logging(s.log_level)
    for problem in s.validate_for_production():
        logging.getLogger("boltitoli").error("config_problem", extra={"problem": problem})
    if s.environment == "production" and s.validate_for_production():
        raise RuntimeError("Refusing to start with insecure production configuration")

    app = FastAPI(title=s.app_name, version="1.0.0", description=DESCRIPTION, docs_url="/api/docs",
                  redoc_url="/api/redoc", openapi_url="/api/openapi.json")
    app.state.limiter = limiter

    @app.exception_handler(RateLimitExceeded)
    async def _rl(_: Request, exc: RateLimitExceeded) -> JSONResponse:
        return JSONResponse(status_code=429, content={"error": {"code": "rate_limited",
                                                                "message": "Too many requests. Please wait a moment.",
                                                                "details": str(exc.detail)}})

    install_error_handlers(app)
    app.add_middleware(RequestLogMiddleware)
    app.add_middleware(CORSMiddleware, allow_origins=s.cors_origins, allow_credentials=True,
                       allow_methods=["*"], allow_headers=["*"], expose_headers=["x-request-id"])

    @app.middleware("http")
    async def security_headers(request: Request, call_next):  # type: ignore[no-untyped-def]
        resp = await call_next(request)
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
        resp.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        resp.headers.setdefault("X-Frame-Options", "DENY")
        return resp

    for r in (auth.router, schools.router, classrooms.router, lessons.router, sessions.router, speech.router,
              misc.router):
        app.include_router(r, prefix="/api/v1")
    return app


app = create_app()
