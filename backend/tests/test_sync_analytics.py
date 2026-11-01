from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy.exc import OperationalError

from app.db import session as dbs
from app.main import app
from tests.conftest import auth, register


def _pack(client, h, skill_code="add_within_10"):
    le = next(x for x in client.get("/api/v1/lessons", headers=h).json() if x["skill"]["code"] == skill_code)
    return client.get(f"/api/v1/lesson-packs/{le['id']}", headers=h).json()


def _offline_payload(pack, group_id, answers):
    start = datetime.now(UTC) - timedelta(hours=2)
    responses = []
    for i, (q, value) in enumerate(answers, start=1):
        responses.append({"client_response_id": uuid.uuid4().hex, "question_id": q["id"], "sequence_no": i,
                          "attempt_no": 1, "input_method": "manual", "value": value,
                          "answered_at": (start + timedelta(seconds=40 * i)).isoformat()})
    return {"client_session_id": uuid.uuid4().hex, "group_id": group_id, "lesson_version_id": pack["version_id"],
            "planned_minutes": 15, "started_at": start.isoformat(),
            "ended_at": (start + timedelta(minutes=15)).isoformat(), "active_seconds": 840,
            "responses": responses}


def test_offline_sync_regrades_and_is_idempotent(client, teacher, classroom_group):
    h = teacher["h"]
    pack = _pack(client, h)
    qs = pack["questions"]
    item = _offline_payload(pack, classroom_group["group"]["id"],
                            [(qs[0], qs[0]["expected_answer"]), (qs[1], qs[1]["expected_answer"] + 1),
                             (qs[2], qs[2]["expected_answer"])])
    r = client.post("/api/v1/sync", json={"sessions": [item]}, headers=h)
    res = r.json()["results"][0]
    assert res["status"] == "accepted"
    summ = client.get(f"/api/v1/sessions/{res['session_id']}/summary", headers=h).json()
    # server graded: 2 right, 1 wrong regardless of what the client thought
    assert summ["stats"]["correct_first_try"] == 2 and summ["stats"]["mode"] == "offline"
    assert summ["stats"]["misconceptions"][0]["code"] == "off_by_one"
    again = client.post("/api/v1/sync", json={"sessions": [item]}, headers=h).json()["results"][0]
    assert again["status"] == "duplicate" and again["session_id"] == res["session_id"]
    assert client.get("/api/v1/sessions", headers=h).json()["total"] == 1


def test_offline_sync_rejects_foreign_questions_and_groups(client, teacher, classroom_group):
    h = teacher["h"]
    pack = _pack(client, h)
    other = _pack(client, h, "count_to_10")
    bad = _offline_payload(pack, classroom_group["group"]["id"], [(other["questions"][0], 3)])
    r = client.post("/api/v1/sync", json={"sessions": [bad]}, headers=h).json()["results"][0]
    assert r["status"] == "rejected" and r["error"] == "unknown_question"

    stranger = register(client, email="x@example.org", school="Other School")
    sh = auth(stranger["access_token"])
    item = _offline_payload(pack, classroom_group["group"]["id"], [(pack["questions"][0], 3)])
    r = client.post("/api/v1/sync", json={"sessions": [item]}, headers=sh).json()["results"][0]
    assert r["status"] == "rejected" and r["error"] == "not_found"


def test_empty_dashboard(client, teacher):
    ov = client.get("/api/v1/analytics/overview", headers=teacher["h"]).json()
    assert ov["sessions_completed"] == 0 and ov["first_try_accuracy"] is None and ov["recent_sessions"] == []
    assert ov["recommendation"]["kind"] == "create_group"
    assert client.get("/api/v1/analytics/groups", headers=teacher["h"]).json() == []


def test_analytics_and_csv(client, teacher, classroom_group):
    h = teacher["h"]
    pack = _pack(client, h)
    qs = pack["questions"]
    client.post("/api/v1/sync", json={"sessions": [_offline_payload(
        pack, classroom_group["group"]["id"], [(q, q["expected_answer"]) for q in qs[:4]])]}, headers=h)
    ov = client.get("/api/v1/analytics/overview?days=7", headers=h).json()
    assert ov["sessions_completed"] == 1 and ov["practice_minutes"] == 14 and ov["first_try_accuracy"] == 100.0
    assert ov["accuracy_sample"] == 4 and ov["offline_sessions"] == 1
    ga = client.get("/api/v1/analytics/groups", headers=h).json()[0]
    assert ga["questions_attempted"] == 4 and ga["enough_data"] is False
    assert ga["weekly"][-1]["sessions"] == 1
    r = client.get("/api/v1/reports/sessions.csv", headers=h)
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    lines = r.text.lstrip("﻿").strip().splitlines()
    assert lines[0].startswith("date,group,skill") and len(lines) == 2 and "Pragati" in lines[1]


def test_official_sees_only_granted_schools(client, teacher, classroom_group, db):
    from app.cli import create_official
    from app.models import User
    h = teacher["h"]
    school_id = teacher["user"]["school_id"]
    create_official(db, "crc@example.org", "CRC Officer", [school_id])
    off = db.query(User).filter_by(email="crc@example.org").one()
    from app.core.security import create_access_token
    oh = auth(create_access_token(off.id, "official"))
    assert client.get("/api/v1/analytics/overview", headers=oh).status_code == 200
    # officials are read-only and cannot touch classrooms or sessions
    assert client.get("/api/v1/groups", headers=oh).status_code == 403
    assert client.post("/api/v1/sessions", json={"group_id": classroom_group["group"]["id"]},
                       headers=oh).status_code == 403
    other = register(client, email="y@example.org", school="Not granted")
    assert client.get(f"/api/v1/analytics/overview?school_id={other['user']['school_id']}",
                      headers=oh).json()["sessions_completed"] == 0
    _ = h


def test_consent_and_retention(client, teacher, classroom_group):
    h = teacher["h"]
    r = client.post("/api/v1/schools/current/consents", headers=h, json={
        "consent_type": "school_authorisation", "scope": "Use of BoltiToli for group maths practice",
        "method": "smc_meeting", "reference": "SMC minutes 12 Aug", "granted_on": datetime.now(UTC).isoformat()})
    assert r.status_code == 201
    cid = r.json()["id"]
    assert client.post(f"/api/v1/schools/current/consents/{cid}/revoke", headers=h).json()["revoked_on"]
    assert client.patch("/api/v1/schools/current", json={"data_retention_days": 30}, headers=h).status_code == 422
    assert client.patch("/api/v1/schools/current", json={"data_retention_days": 365},
                        headers=h).json()["data_retention_days"] == 365
    assert client.post("/api/v1/schools/current/retention/apply", headers=h).json()["deleted_sessions"] == 0
    assert client.delete("/api/v1/schools/current/data?confirm=nope", headers=h).status_code == 409
    assert client.delete("/api/v1/schools/current/data?confirm=DELETE", headers=h).status_code == 204


def test_health(client):
    assert client.get("/api/v1/health").json() == {"status": "ok"}
    assert client.get("/api/v1/health/ready").json()["database"] == "ok"


def test_hosted_database_urls_use_psycopg3(monkeypatch):
    from app.core.config import Settings

    for given in ("postgres://u:p@host/db?sslmode=require", "postgresql://u:p@host/db?sslmode=require"):
        monkeypatch.setenv("DATABASE_URL", given)
        assert Settings(_env_file=None).database_url == "postgresql+psycopg://u:p@host/db?sslmode=require"
    monkeypatch.setenv("DATABASE_URL", "sqlite:///./x.db")
    assert Settings(_env_file=None).database_url == "sqlite:///./x.db"


def test_cors_origins_accepts_comma_separated_env(monkeypatch):
    # the format used by .env.example and docker-compose.yml
    from app.core.config import Settings

    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:5173, http://localhost:4173")
    assert Settings(_env_file=None).cors_origins == ["http://localhost:5173", "http://localhost:4173"]
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:8080")
    assert Settings(_env_file=None).cors_origins == ["http://localhost:8080"]


def test_database_failure_is_reported(client, teacher):
    class Broken:
        def execute(self, *_a, **_k):
            raise OperationalError("SELECT 1", {}, Exception("down"))

        def get(self, *_a, **_k):
            raise OperationalError("SELECT", {}, Exception("down"))

        def close(self):
            pass

    app.dependency_overrides[dbs.get_db] = lambda: Broken()
    r = client.get("/api/v1/health/ready")
    assert r.status_code == 503
    r = client.get("/api/v1/auth/me", headers=teacher["h"])
    assert r.status_code == 503 and r.json()["error"]["code"] == "database_unavailable"


def test_no_child_audio_or_identity_columns():
    from app.db.base import Base
    cols = {c.name for t in Base.metadata.tables.values() for c in t.columns}
    for forbidden in ("audio", "audio_blob", "voiceprint", "transcript", "child_name", "student_name", "photo"):
        assert forbidden not in cols


def test_migrations_apply_cleanly(tmp_path, monkeypatch):
    from alembic.config import Config

    from alembic import command
    from app.core.config import get_settings
    url = f"sqlite:///{tmp_path / 'm.db'}"
    monkeypatch.setattr(get_settings(), "database_url", url)
    cfg = Config(str(__import__("pathlib").Path(__file__).resolve().parents[1] / "alembic.ini"))
    cfg.set_main_option("script_location", str(__import__("pathlib").Path(__file__).resolve().parents[1] / "alembic"))
    command.upgrade(cfg, "head")
    command.check(cfg)
    command.downgrade(cfg, "base")
