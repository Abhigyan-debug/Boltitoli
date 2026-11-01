"""The public demo school, rate-limit keys behind proxies, and the daily demo reset."""
from __future__ import annotations

from datetime import timedelta
from types import SimpleNamespace

from sqlalchemy import select, update

from app.cli import DEMO_EMAIL
from app.core.config import get_settings
from app.core.rate_limit import client_ip
from app.db.base import utcnow
from app.models import School, Session, User
from tests.conftest import auth


def _demo(client) -> dict:
    r = client.post("/api/v1/auth/demo")
    assert r.status_code == 200, r.text
    return auth(r.json()["access_token"])


def test_demo_school_blocks_shared_and_destructive_actions(client):
    h = _demo(client)
    lesson = client.get("/api/v1/lessons", headers=h).json()[0]
    blocked = [
        client.delete("/api/v1/schools/current/data?confirm=DELETE", headers=h),
        client.post("/api/v1/schools/current/staff", json={"full_name": "Asha", "email": "asha@example.org"}, headers=h),
        client.patch("/api/v1/schools/current", json={"name": "Renamed school"}, headers=h),
        client.post("/api/v1/schools/current/retention/apply", headers=h),
        client.patch("/api/v1/auth/me", json={"full_name": "Someone else"}, headers=h),
        client.post("/api/v1/auth/change-password", json={"current_password": "x", "new_password": "chalk-board-99"}, headers=h),
        client.post(f"/api/v1/lessons/{lesson['id']}/review", json={"version_id": lesson["published_version"]["id"]}, headers=h),
        client.post(f"/api/v1/lessons/{lesson['id']}/draft-questions", json={"count": 3, "difficulty": 2}, headers=h),
    ]
    for r in blocked:
        assert r.status_code == 403, r.text
        assert r.json()["error"]["code"] == "demo_read_only"


def test_demo_school_can_still_run_sessions(client):
    h = _demo(client)
    busy = {s["group_id"] for s in client.get("/api/v1/sessions/active", headers=h).json()}
    group = next(g for g in client.get("/api/v1/groups", headers=h).json() if g["id"] not in busy)
    r = client.post("/api/v1/sessions", json={"group_id": group["id"]}, headers=h)
    assert r.status_code == 201, r.text


def test_real_school_admin_is_not_affected(client, teacher):
    r = client.patch("/api/v1/schools/current", json={"name": "GPS Rampur (renamed)"}, headers=teacher["h"])
    assert r.status_code == 200, r.text


def test_demo_school_is_rebuilt_after_a_day(client, db):
    _demo(client)
    old = db.scalar(select(User).where(User.email == DEMO_EMAIL))
    old_school, old_user = old.school_id, old.id
    assert db.scalar(select(Session).where(Session.school_id == old_school)) is not None
    db.execute(update(School).where(School.id == old_school).values(created_at=utcnow() - timedelta(hours=25)))
    db.commit()

    _demo(client)
    db.expire_all()
    new = db.scalar(select(User).where(User.email == DEMO_EMAIL))
    assert new.id != old_user and new.school_id != old_school
    assert db.get(School, old_school) is None
    # the database cascade removed the old school's sessions too
    assert db.scalar(select(Session).where(Session.school_id == old_school)) is None


def _req(xff: str | None, peer: str = "10.0.0.9"):
    headers = {"x-forwarded-for": xff} if xff else {}
    return SimpleNamespace(headers=headers, client=SimpleNamespace(host=peer))


def test_rate_limit_key_ignores_forged_forwarded_for(monkeypatch):
    s = get_settings()
    # Real chains seen on Render (behind Cloudflare and an internal hop), 1 Nov 2026:
    via_vercel = "203.0.113.7,198.51.100.20, 198.51.100.30, 10.26.48.144"  # client, Vercel, Cloudflare, Render
    direct = "203.0.113.7, 198.51.100.31, 10.30.215.2"  # client, Cloudflare, Render
    monkeypatch.setattr(s, "trusted_proxy_hops", 4)
    assert client_ip(_req(via_vercel)) == "203.0.113.7"
    assert client_ip(_req(direct)) == "203.0.113.7"  # shorter chain: the first entry is the client
    # Vercel discards a forged header, so the chain through the website never contains it
    monkeypatch.setattr(s, "trusted_proxy_hops", 1)
    assert client_ip(_req("6.6.6.6, 203.0.113.7")) == "203.0.113.7"
    monkeypatch.setattr(s, "trusted_proxy_hops", 0)  # no proxy: socket address, header ignored
    assert client_ip(_req("6.6.6.6")) == "10.0.0.9"
