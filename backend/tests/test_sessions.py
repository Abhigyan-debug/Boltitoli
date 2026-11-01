from __future__ import annotations

from tests.conftest import auth, register


def _start(client, h, group_id):
    r = client.post("/api/v1/sessions", json={"group_id": group_id}, headers=h)
    assert r.status_code == 201, r.text
    s = r.json()
    assert s["status"] == "prepared" and s["current_question"] is not None
    s = client.post(f"/api/v1/sessions/{s['id']}/start", headers=h).json()
    assert s["status"] == "active"
    return s


def _answer(client, h, s, value=None, key=None, **extra):
    q = s["current_question"]
    body = {"question_id": q["id"], "input_method": extra.pop("input_method", "manual"), "value": value, **extra}
    headers = dict(h)
    if key:
        headers["Idempotency-Key"] = key
    return client.post(f"/api/v1/sessions/{s['id']}/answer", json=body, headers=headers)


def test_full_session_flow(client, teacher, classroom_group):
    h = teacher["h"]
    s = _start(client, h, classroom_group["group"]["id"])
    assert s["skill"]["code"] == "add_within_10" and s["lesson_status"] == "draft"

    # correct, correct -> promoted to difficulty 2
    for _ in range(2):
        r = _answer(client, h, s, s["current_question"]["expected_answer"])
        assert r.status_code == 200, r.text
        s = r.json()["session"]
    assert r.json()["feedback"]["action"] == "harder" and s["current_difficulty"] == 2

    # wrong -> hint, same question
    q = s["current_question"]
    a, b = q["operands"]["a"], q["operands"]["b"]
    r = _answer(client, h, s, abs(a - b) if abs(a - b) != q["expected_answer"] else q["expected_answer"] + 1)
    fb = r.json()["feedback"]
    assert fb["outcome"] == "incorrect" and fb["action"] == "retry_with_hint" and fb["hint_hi"]
    s = r.json()["session"]
    assert s["current_question"]["id"] == q["id"] and s["current_attempt"] == 2

    # wrong again -> explanation and easier question
    r = _answer(client, h, s, q["expected_answer"] + 2)
    fb = r.json()["feedback"]
    assert fb["action"] == "easier" and fb["explanation_hi"] and fb["feedback_source"] == "rules"
    s = r.json()["session"]
    assert s["current_difficulty"] == 1

    # pause / resume
    assert client.post(f"/api/v1/sessions/{s['id']}/pause", headers=h).json()["status"] == "paused"
    r = _answer(client, h, s, 1)
    assert r.status_code == 409 and r.json()["error"]["code"] == "session_not_active"
    s = client.post(f"/api/v1/sessions/{s['id']}/resume", headers=h).json()

    # end -> summary
    s = client.post(f"/api/v1/sessions/{s['id']}/end", headers=h).json()
    assert s["status"] == "completed" and s["has_summary"]
    summ = client.get(f"/api/v1/sessions/{s['id']}/summary", headers=h).json()
    st = summ["stats"]
    assert st["questions_attempted"] == 3
    assert st["correct_first_try"] == 2 and st["not_yet"] == 1
    assert summ["generated_by"] == "rules" and "प्रगति" not in summ["summary_hi"]  # group name is "Pragati"
    assert "Pragati" in summ["summary_hi"]
    assert summ["level_suggestion"] == "keep"  # too little evidence to suggest a change
    # ending again is idempotent
    assert client.post(f"/api/v1/sessions/{s['id']}/end", headers=h).status_code == 200

    groups = client.get("/api/v1/groups", headers=h).json()
    assert groups[0]["sessions_count"] == 1


def test_idempotent_answer_and_stale_question(client, teacher, classroom_group):
    h = teacher["h"]
    s = _start(client, h, classroom_group["group"]["id"])
    first = _answer(client, h, s, s["current_question"]["expected_answer"], key="answer-key-000001")
    again = _answer(client, h, s, s["current_question"]["expected_answer"], key="answer-key-000001")
    assert first.status_code == again.status_code == 200
    assert again.json()["replayed"] is True
    assert again.json()["feedback"] == first.json()["feedback"]
    # same question again without key -> stale
    r = _answer(client, h, s, 1)
    assert r.status_code == 409 and r.json()["error"]["code"] == "stale_question"


def test_uncertain_voice_is_not_graded(client, teacher, classroom_group):
    h = teacher["h"]
    s = _start(client, h, classroom_group["group"]["id"])
    exp = s["current_question"]["expected_answer"]
    r = _answer(client, h, s, exp, input_method="voice", confidence=None, confirmed=False)
    fb = r.json()["feedback"]
    assert fb["outcome"] == "unclear" and fb["action"] == "ask_again"
    s = r.json()["session"]
    r = _answer(client, h, s, exp, input_method="voice", confidence=None, confirmed=False)
    assert r.json()["feedback"]["suggest_manual"] is True
    # once a human confirms, it is graded
    s = r.json()["session"]
    r = _answer(client, h, s, exp, input_method="voice", confirmed=True)
    assert r.json()["feedback"]["outcome"] == "correct"


def test_text_answers_are_parsed(client, teacher, classroom_group):
    h = teacher["h"]
    s = _start(client, h, classroom_group["group"]["id"])
    q = s["current_question"]
    from app.lesson_engine.hindi_numbers import number_to_hindi
    r = client.post(f"/api/v1/sessions/{s['id']}/answer", headers=h, json={
        "question_id": q["id"], "input_method": "leader", "text": number_to_hindi(q["expected_answer"])})
    assert r.json()["feedback"]["outcome"] == "correct"


def test_teacher_override(client, teacher, classroom_group):
    h = teacher["h"]
    s = _start(client, h, classroom_group["group"]["id"])
    r = _answer(client, h, s, None, input_method="override")
    assert r.status_code == 400 and r.json()["error"]["code"] == "override_required"
    r = _answer(client, h, s, None, input_method="override", override_outcome="skipped")
    assert r.json()["feedback"]["outcome"] == "skipped"
    s = r.json()["session"]
    r = _answer(client, h, s, None, input_method="override", override_outcome="correct")
    assert r.json()["feedback"]["outcome"] == "correct"


def test_one_unfinished_session_per_group(client, teacher, classroom_group):
    h = teacher["h"]
    s = _start(client, h, classroom_group["group"]["id"])
    r = client.post("/api/v1/sessions", json={"group_id": classroom_group["group"]["id"]}, headers=h)
    assert r.status_code == 409 and r.json()["error"]["details"]["session_id"] == s["id"]
    assert len(client.get("/api/v1/sessions/active", headers=h).json()) == 1


def test_ending_without_answers_is_abandoned(client, teacher, classroom_group):
    h = teacher["h"]
    s = _start(client, h, classroom_group["group"]["id"])
    s = client.post(f"/api/v1/sessions/{s['id']}/end", headers=h).json()
    assert s["status"] == "abandoned"
    summ = client.get(f"/api/v1/sessions/{s['id']}/summary", headers=h).json()
    assert summ["stats"]["questions_attempted"] == 0 and "कोई निष्कर्ष नहीं" in summ["summary_hi"]


def test_group_needs_skill(client, teacher, classroom_group):
    h = teacher["h"]
    g = client.post("/api/v1/groups", json={"classroom_id": classroom_group["classroom"]["id"], "name": "Udaan"},
                    headers=h).json()
    r = client.post("/api/v1/sessions", json={"group_id": g["id"]}, headers=h)
    assert r.json()["error"]["code"] == "skill_required"


def test_tenant_isolation(client, teacher, classroom_group):
    h = teacher["h"]
    s = _start(client, h, classroom_group["group"]["id"])
    other = register(client, email="other@example.org", school="GPS Elsewhere")
    oh = auth(other["access_token"])
    gid = classroom_group["group"]["id"]
    assert client.get(f"/api/v1/groups/{gid}", headers=oh).status_code == 404
    assert client.get(f"/api/v1/sessions/{s['id']}", headers=oh).status_code == 404
    assert client.post(f"/api/v1/sessions/{s['id']}/end", headers=oh).status_code == 404
    assert client.patch(f"/api/v1/groups/{gid}", json={"name": "x"}, headers=oh).status_code == 404
    assert client.post("/api/v1/groups", json={"classroom_id": classroom_group["classroom"]["id"], "name": "x"},
                       headers=oh).status_code == 404
    assert client.get("/api/v1/sessions", headers=oh).json()["total"] == 0
    assert client.get("/api/v1/groups", headers=oh).json() == []


def test_classroom_and_group_crud(client, teacher, classroom_group):
    h = teacher["h"]
    gid = classroom_group["group"]["id"]
    r = client.patch(f"/api/v1/groups/{gid}", json={"level": "advancing", "leader_label": "Roll 4"}, headers=h)
    assert r.json()["level"] == "advancing"
    r = client.patch(f"/api/v1/groups/{gid}", json={"current_skill_id": "nope"}, headers=h)
    assert r.status_code == 422
    r = client.patch(f"/api/v1/groups/{gid}", json={"archived": True}, headers=h)
    assert r.json()["archived_at"] is not None
    assert client.get("/api/v1/groups", headers=h).json() == []
    assert len(client.get("/api/v1/groups?include_archived=true", headers=h).json()) == 1
    cid = classroom_group["classroom"]["id"]
    assert client.patch(f"/api/v1/classrooms/{cid}", json={"grades": "9"}, headers=h).status_code == 422
    assert client.patch(f"/api/v1/classrooms/{cid}", json={"name": "Room A"}, headers=h).json()["name"] == "Room A"


def test_lesson_review_flow(client, teacher):
    h = teacher["h"]
    lessons = client.get("/api/v1/lessons", headers=h).json()
    assert len(lessons) == 9 and all(le["published_version"]["status"] == "draft" for le in lessons)
    le = lessons[0]
    detail = client.get(f"/api/v1/lessons/{le['id']}", headers=h).json()
    assert len(detail["questions"]) == 15
    r = client.post(f"/api/v1/lessons/{le['id']}/review", json={"version_id": le["published_version"]["id"],
                                                                "note": "Checked wording with class"}, headers=h)
    assert r.status_code == 200 and r.json()["status"] == "reviewed"
    assert r.json()["reviewed_by_name"] == "Meera Singh"
    pack = client.get(f"/api/v1/lesson-packs/{le['id']}", headers=h).json()
    assert pack["status"] == "reviewed" and pack["audio_status"] == "unavailable" and len(pack["questions"]) == 15


def test_teacher_can_ask_for_easier_or_harder(client, teacher, classroom_group):
    h = teacher["h"]
    s = _start(client, h, classroom_group["group"]["id"])
    first = s["current_question"]["id"]
    s = client.post(f"/api/v1/sessions/{s['id']}/adjust", json={"direction": "harder"}, headers=h).json()
    assert s["current_difficulty"] == 2 and s["current_question"]["difficulty"] == 2
    assert s["current_question"]["id"] != first and s["lesson_id"]
    s = client.post(f"/api/v1/sessions/{s['id']}/adjust", json={"direction": "easier"}, headers=h).json()
    s = client.post(f"/api/v1/sessions/{s['id']}/adjust", json={"direction": "easier"}, headers=h).json()
    assert s["current_difficulty"] == 1
    assert client.post(f"/api/v1/sessions/{s['id']}/adjust", json={"direction": "sideways"}, headers=h).status_code == 422
