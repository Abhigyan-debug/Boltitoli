from __future__ import annotations

from datetime import UTC, datetime, timedelta

import jwt

from app.core.config import get_settings
from tests.conftest import auth, register


def test_register_login_me(client):
    data = register(client)
    assert data["user"]["role"] == "school_admin"
    assert "bt_refresh" in client.cookies
    me = client.get("/api/v1/auth/me", headers=auth(data["access_token"]))
    assert me.status_code == 200 and me.json()["school"]["name"] == "GPS Rampur"
    r = client.post("/api/v1/auth/login", json={"email": "MEERA@example.org", "password": "chalk-board-42"})
    assert r.status_code == 200


def test_password_rules_and_duplicates(client):
    r = client.post("/api/v1/auth/register", json={"full_name": "A B", "email": "a@b.org", "password": "short",
                                                   "school": {"name": "S"}})
    assert r.status_code == 422 and r.json()["error"]["code"] == "validation_error"
    register(client)
    r = client.post("/api/v1/auth/register", json={"full_name": "X Y", "email": "meera@example.org",
                                                   "password": "another-pass-1", "school": {"name": "Other"}})
    assert r.status_code == 409 and r.json()["error"]["code"] == "email_taken"


def test_wrong_password_and_unknown_user_look_identical(client):
    register(client)
    a = client.post("/api/v1/auth/login", json={"email": "meera@example.org", "password": "wrong-pass-1"})
    b = client.post("/api/v1/auth/login", json={"email": "nobody@example.org", "password": "wrong-pass-1"})
    assert a.status_code == b.status_code == 401
    assert a.json() == b.json()


def test_refresh_rotation_and_reuse_detection(client):
    register(client)
    first_cookie = client.cookies.get("bt_refresh")
    r = client.post("/api/v1/auth/refresh")
    assert r.status_code == 200
    assert client.cookies.get("bt_refresh") != first_cookie
    # replaying the old (rotated) token revokes everything
    client.cookies.set("bt_refresh", first_cookie, path="/api/v1/auth")
    r = client.post("/api/v1/auth/refresh")
    assert r.status_code == 401 and r.json()["error"]["code"] == "refresh_token_reused"


def test_logout_revokes_refresh(client):
    register(client)
    cookie = client.cookies.get("bt_refresh")
    assert client.post("/api/v1/auth/logout").status_code == 204
    client.cookies.set("bt_refresh", cookie, path="/api/v1/auth")
    assert client.post("/api/v1/auth/refresh").status_code == 401


def test_expired_and_invalid_access_tokens(client):
    data = register(client)
    s = get_settings()
    expired = jwt.encode({"sub": data["user"]["id"], "typ": "access", "role": "teacher",
                          "exp": datetime.now(UTC) - timedelta(minutes=1)}, s.jwt_secret, algorithm=s.jwt_algorithm)
    r = client.get("/api/v1/auth/me", headers=auth(expired))
    assert r.status_code == 401 and r.json()["error"]["code"] == "token_expired"
    r = client.get("/api/v1/auth/me", headers=auth("garbage"))
    assert r.json()["error"]["code"] == "invalid_token"
    # a refresh token cannot be used as an access token
    refresh = client.cookies.get("bt_refresh")
    assert client.get("/api/v1/auth/me", headers=auth(refresh)).status_code == 401
    assert client.get("/api/v1/auth/me").json()["error"]["code"] == "not_authenticated"


def test_change_password(client):
    data = register(client)
    h = auth(data["access_token"])
    r = client.post("/api/v1/auth/change-password", json={"current_password": "nope", "new_password": "newpass-123"},
                    headers=h)
    assert r.status_code == 400
    r = client.post("/api/v1/auth/change-password",
                    json={"current_password": "chalk-board-42", "new_password": "newpass-123"}, headers=h)
    assert r.status_code == 204
    assert client.post("/api/v1/auth/login", json={"email": "meera@example.org", "password": "newpass-123"}).status_code == 200


def test_staff_and_roles(client):
    admin = register(client)
    h = auth(admin["access_token"])
    r = client.post("/api/v1/schools/current/staff", json={"full_name": "Ravi Kumar", "email": "ravi@example.org"},
                    headers=h)
    assert r.status_code == 201
    temp = r.json()["temporary_password"]
    t = client.post("/api/v1/auth/login", json={"email": "ravi@example.org", "password": temp}).json()
    th = auth(t["access_token"])
    assert t["user"]["role"] == "teacher"
    # teachers cannot add staff, see audit logs, or delete data
    assert client.post("/api/v1/schools/current/staff", json={"full_name": "Z Z", "email": "z@example.org"},
                       headers=th).status_code == 403
    assert client.get("/api/v1/schools/current/audit", headers=th).status_code == 403
    assert client.get("/api/v1/admin/providers", headers=th).status_code == 403
    actions = [e["action"] for e in client.get("/api/v1/schools/current/audit", headers=h).json()]
    assert "staff.add" in actions and "user.register" in actions


def test_demo_login_is_labelled(client):
    r = client.post("/api/v1/auth/demo")
    assert r.status_code == 200
    h = auth(r.json()["access_token"])
    assert r.json()["user"]["school"]["is_demo"] is True
    ov = client.get("/api/v1/analytics/overview?days=30", headers=h).json()
    assert ov["is_demo"] is True and ov["sessions_completed"] > 0
