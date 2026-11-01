"""Analytics, reports, offline sync, health and admin provider status."""

from __future__ import annotations

import csv
import io
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import text
from sqlalchemy.orm import Session as DB

from app.ai.health import health
from app.api.deps import admin, get_current_user, staff
from app.core.config import get_settings
from app.core.errors import NotFound
from app.core.rate_limit import client_ip
from app.db.base import utcnow
from app.db.session import get_db
from app.models import User
from app.schemas import GroupAnalytics, OverviewOut, SyncIn, SyncOut
from app.services import analytics_service, sync_service
from app.services.access import school_ids_for
from app.speech.service import SpeechToTextService, TextToSpeechService

router = APIRouter()


# ------------------------------------------------------------- analytics --- #
@router.get("/analytics/overview", response_model=OverviewOut, tags=["analytics"],
            summary="Measured totals for the period (from recorded sessions only)")
def overview(days: int = 7, school_id: str | None = None, user: User = Depends(get_current_user),
             db: DB = Depends(get_db)) -> OverviewOut:
    return analytics_service.overview(db, user, max(1, min(days, 365)), school_id)


@router.get("/analytics/groups", response_model=list[GroupAnalytics], tags=["analytics"])
def groups(weeks: int = 6, school_id: str | None = None, user: User = Depends(get_current_user),
           db: DB = Depends(get_db)) -> list[GroupAnalytics]:
    return analytics_service.group_analytics(db, user, max(1, min(weeks, 26)), school_id)


# --------------------------------------------------------------- reports --- #
@router.get("/reports/sessions.csv", tags=["reports"], summary="Download session records as CSV",
            responses={200: {"content": {"text/csv": {}}}})
def sessions_csv(since: datetime | None = None, until: datetime | None = None, group_id: str | None = None,
                 user: User = Depends(get_current_user), db: DB = Depends(get_db)) -> Response:
    ids = school_ids_for(db, user)
    since = since or (utcnow() - timedelta(days=30))
    q = analytics_service.sessions_query(db, ids, since, group_id, ("completed",))
    if until:
        q = q.where(analytics_service.Session.started_at <= until)
    buf = io.StringIO()
    buf.write("﻿")  # BOM so Excel opens Devanagari correctly
    w = csv.writer(buf)
    w.writerow(["date", "group", "skill", "mode", "minutes", "questions_attempted", "correct_first_try",
                "correct_after_hint", "needs_more_practice", "first_try_accuracy_pct", "highest_difficulty",
                "top_difficulty_observed", "summary_written_by"])
    for s in db.scalars(q):
        st = s.summary.stats if s.summary else {}
        mis = st.get("misconceptions") or []
        w.writerow([s.started_at.date().isoformat(), s.group.name, s.lesson_version.lesson.skill.name_en, s.mode,
                    round(s.active_seconds / 60), st.get("questions_attempted", 0), st.get("correct_first_try", 0),
                    st.get("correct_after_hint", 0), st.get("not_yet", 0), st.get("first_try_accuracy_pct") or "",
                    st.get("highest_difficulty", ""), mis[0]["label_hi"] if mis else "",
                    s.summary.generated_by if s.summary else ""])
    fname = f"boltitoli-sessions-{utcnow().date().isoformat()}.csv"
    return Response(buf.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{fname}"'})


# ------------------------------------------------------------------ sync --- #
@router.post("/sync", response_model=SyncOut, tags=["offline"],
             summary="Upload sessions recorded offline (idempotent per client_session_id)")
def sync(data: SyncIn, user: User = Depends(staff), db: DB = Depends(get_db)) -> SyncOut:
    return SyncOut(results=[sync_service.sync_session(db, user, item) for item in data.sessions])


# ---------------------------------------------------------------- health --- #
@router.get("/health", tags=["health"], summary="Liveness")
def health_live() -> dict:
    return {"status": "ok"}


@router.get("/health/ready", tags=["health"], summary="Readiness: database reachable")
def health_ready(response: Response, db: DB = Depends(get_db)) -> dict:
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ready", "database": "ok"}
    except Exception:  # noqa: BLE001
        response.status_code = 503
        return {"status": "not_ready", "database": "unavailable"}


@router.get("/debug/client", include_in_schema=False)
def debug_client(request: Request) -> dict:
    """Temporary deployment check: shows the caller's own proxy chain and the rate-limit key.
    Disabled unless DEBUG_CLIENT_IP=true; turn it off again after setting TRUSTED_PROXY_HOPS."""
    if not get_settings().debug_client_ip:
        raise NotFound("Not found.")
    marks = ("forward", "real-ip", "client-ip", "cf-connecting", "x-vercel", "true-client")
    chain = {k: v for k, v in request.headers.items() if any(m in k.lower() for m in marks)}
    peer = request.client.host if request.client else None
    return {"rate_limit_key": client_ip(request), "peer": peer, "headers": chain}


@router.get("/admin/providers", tags=["admin"], summary="AI and voice provider health (administrators)")
def providers(_: User = Depends(admin)) -> dict:
    s = get_settings()
    SpeechToTextService.available()
    TextToSpeechService.available()
    from app.ai import claude_client
    claude_client.is_available()
    return {"providers": health.snapshot(),
            "models": {"summary": s.anthropic_model_summary, "feedback": s.anthropic_model_feedback,
                       "stt": s.sarvam_stt_model, "tts": s.sarvam_tts_model},
            "fallback": "Deterministic lesson engine and rule-based summaries are always available."}
