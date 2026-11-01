from __future__ import annotations

import os
import tempfile

os.environ.update({
    "ENVIRONMENT": "test",
    "DATABASE_URL": "sqlite://",
    "RATE_LIMIT_ENABLED": "false",
    "BCRYPT_ROUNDS": "4",
    "ANTHROPIC_API_KEY": "",
    "SARVAM_API_KEY": "",
    "TTS_CACHE_DIR": tempfile.mkdtemp(prefix="bt-tts-"),
})

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, event  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.db.session as dbs  # noqa: E402
from app.ai.health import health  # noqa: E402
from app.core.config import get_settings  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.main import app  # noqa: E402
from app.services.lesson_service import seed_library  # noqa: E402

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")


@pytest.fixture()
def db_factory(monkeypatch):
    if TEST_DATABASE_URL:  # e.g. PostgreSQL in CI
        engine = create_engine(TEST_DATABASE_URL)
        Base.metadata.drop_all(engine)
    else:
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        # enforce foreign keys (and their ON DELETE CASCADE) like the app's own engine does
        event.listen(engine, "connect", lambda conn, _rec: conn.execute("PRAGMA foreign_keys=ON"))
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    monkeypatch.setattr(dbs, "SessionLocal", factory)
    import app.api.v1.speech as speech_mod
    monkeypatch.setattr(speech_mod, "SessionLocal", factory)
    with factory() as db:
        seed_library(db)
    yield factory
    if TEST_DATABASE_URL:
        Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture()
def db(db_factory):
    with db_factory() as s:
        yield s


@pytest.fixture()
def client(db_factory):
    def _get_db():
        s = db_factory()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[dbs.get_db] = _get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def _reset_providers(monkeypatch, tmp_path):
    s = get_settings()
    monkeypatch.setattr(s, "tts_cache_dir", str(tmp_path / "tts"))
    monkeypatch.setattr(s, "anthropic_api_key", None)
    monkeypatch.setattr(s, "sarvam_api_key", None)
    health.reset()
    yield
    health.reset()


@pytest.fixture()
def claude_on(monkeypatch):
    monkeypatch.setattr(get_settings(), "anthropic_api_key", "test-key")
    health.reset()


@pytest.fixture()
def sarvam_on(monkeypatch):
    monkeypatch.setattr(get_settings(), "sarvam_api_key", "test-key")
    health.reset()


def register(client: TestClient, email: str = "meera@example.org", school: str = "GPS Rampur") -> dict:
    r = client.post("/api/v1/auth/register", json={
        "full_name": "Meera Singh", "email": email, "password": "chalk-board-42",
        "school": {"name": school, "district": "Mathura"}})
    assert r.status_code == 201, r.text
    return r.json()


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def teacher(client) -> dict:
    data = register(client)
    data["h"] = auth(data["access_token"])
    return data


@pytest.fixture()
def classroom_group(client, teacher) -> dict:
    h = teacher["h"]
    room = client.post("/api/v1/classrooms", json={"name": "Class 1-3", "grades": "1-3"}, headers=h).json()
    skills = client.get("/api/v1/skills", headers=h).json()
    add10 = next(s for s in skills if s["code"] == "add_within_10")
    g = client.post("/api/v1/groups", json={"classroom_id": room["id"], "name": "Pragati", "level": "developing",
                                           "size": 7, "current_skill_id": add10["id"]}, headers=h)
    assert g.status_code == 201, g.text
    return {"classroom": room, "group": g.json(), "skill": add10, "skills": skills}
