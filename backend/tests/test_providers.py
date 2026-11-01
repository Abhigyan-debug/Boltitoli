"""Claude and Sarvam integrations against mocked HTTP. No live calls are made."""

from __future__ import annotations

import base64
import json

import httpx
import respx

from app.ai.health import health

CLAUDE = "https://api.anthropic.com/v1/messages"
STT = "https://api.sarvam.ai/speech-to-text"
TTS = "https://api.sarvam.ai/text-to-speech"


def _tool(name: str, payload: dict) -> httpx.Response:
    # structured outputs: the JSON arrives as the text block (`name` kept so call sites read clearly)
    return httpx.Response(200, json={"stop_reason": "end_turn",
                                     "content": [{"type": "text", "text": json.dumps(payload, ensure_ascii=False)}]})


def _run_session(client, h, gid, n_correct=3):
    s = client.post("/api/v1/sessions", json={"group_id": gid}, headers=h).json()
    s = client.post(f"/api/v1/sessions/{s['id']}/start", headers=h).json()
    for _ in range(n_correct):
        q = s["current_question"]
        s = client.post(f"/api/v1/sessions/{s['id']}/answer", headers=h,
                        json={"question_id": q["id"], "input_method": "manual", "value": q["expected_answer"]}
                        ).json()["session"]
    return client.post(f"/api/v1/sessions/{s['id']}/end", headers=h).json()


@respx.mock
def test_claude_summary_used_when_grounded(client, teacher, classroom_group, claude_on):
    route = respx.post(CLAUDE).mock(return_value=_tool("write_teacher_summary", {
        "summary_hi": "आज समूह ने 3 सवाल किए और 3 पहली बार में सही रहे। सवाल कम थे, इसलिए यह सिर्फ़ एक झलक है।",
        "next_activity_hi": "अगली बार भी जोड़ का अभ्यास जारी रखें।"}))
    s = _run_session(client, teacher["h"], classroom_group["group"]["id"])
    summ = client.get(f"/api/v1/sessions/{s['id']}/summary", headers=teacher["h"]).json()
    assert summ["generated_by"] == "claude"
    sent = route.calls.last.request
    assert sent.headers["x-api-key"] == "test-key"
    body = sent.content.decode()
    assert "Pragati" not in body  # group names are not sent to the LLM
    sent_json = json.loads(body)
    # current models reject forced tool_choice; JSON comes from structured outputs with a closed schema
    assert "tool_choice" not in sent_json and "tools" not in sent_json
    assert sent_json["output_config"]["format"]["schema"]["additionalProperties"] is False


@respx.mock
def test_claude_refusal_falls_back_to_rules(client, teacher, classroom_group, claude_on):
    respx.post(CLAUDE).mock(return_value=httpx.Response(200, json={"stop_reason": "refusal", "content": []}))
    s = _run_session(client, teacher["h"], classroom_group["group"]["id"])
    summ = client.get(f"/api/v1/sessions/{s['id']}/summary", headers=teacher["h"]).json()
    assert summ["generated_by"] == "rules"


@respx.mock
def test_claude_summary_rejected_when_numbers_invented(client, teacher, classroom_group, claude_on):
    respx.post(CLAUDE).mock(return_value=_tool("write_teacher_summary", {
        "summary_hi": "आज समूह ने 25 सवाल किए और 92 प्रतिशत सही रहे, बहुत बढ़िया प्रगति।",
        "next_activity_hi": "अगला कौशल शुरू करें।"}))
    s = _run_session(client, teacher["h"], classroom_group["group"]["id"])
    summ = client.get(f"/api/v1/sessions/{s['id']}/summary", headers=teacher["h"]).json()
    assert summ["generated_by"] == "rules"


@respx.mock
def test_claude_outage_falls_back_and_opens_breaker(client, teacher, classroom_group, claude_on, monkeypatch):
    import app.ai.claude_client as cc
    monkeypatch.setattr(cc.time, "sleep", lambda *_: None)
    route = respx.post(CLAUDE).mock(return_value=httpx.Response(529, json={"error": {"type": "overloaded"}}))
    s = _run_session(client, teacher["h"], classroom_group["group"]["id"])
    summ = client.get(f"/api/v1/sessions/{s['id']}/summary", headers=teacher["h"]).json()
    assert summ["generated_by"] == "rules"
    assert route.call_count == 3  # 1 try + 2 bounded retries
    snap = {p["name"]: p for p in health.snapshot()}
    assert snap["claude"]["state"] == "degraded" and snap["claude"]["consecutive_failures"] == 1
    providers = client.get("/api/v1/admin/providers", headers=teacher["h"]).json()
    assert any(p["name"] == "claude" and p["last_error_code"] == "http_529" for p in providers["providers"])


def test_circuit_breaker_skips_calls_after_repeated_failures(claude_on):
    import app.ai.claude_client as cc
    for _ in range(3):
        health.fail("claude", "timeout")
    assert cc.is_available() is False
    try:
        cc.call_tool(model="m", system="s", user="u", tool_name="t", tool_description="d", input_schema={})
    except cc.ProviderError as e:
        assert e.code == "unavailable"
    else:
        raise AssertionError("expected ProviderError")


@respx.mock
def test_claude_timeout_falls_back(client, teacher, classroom_group, claude_on, monkeypatch):
    import app.ai.claude_client as cc
    monkeypatch.setattr(cc.time, "sleep", lambda *_: None)
    respx.post(CLAUDE).mock(side_effect=httpx.ReadTimeout("slow"))
    s = _run_session(client, teacher["h"], classroom_group["group"]["id"])
    assert client.get(f"/api/v1/sessions/{s['id']}/summary", headers=teacher["h"]).json()["generated_by"] == "rules"


@respx.mock
def test_ai_explanation_must_be_grounded(client, teacher, classroom_group, claude_on):
    h = teacher["h"]
    s = client.post("/api/v1/sessions", json={"group_id": classroom_group["group"]["id"]}, headers=h).json()
    s = client.post(f"/api/v1/sessions/{s['id']}/start", headers=h).json()
    q = s["current_question"]
    a, b, exp = q["operands"]["a"], q["operands"]["b"], q["expected_answer"]
    good = f"{a} के आगे {b} गिनो, तो {exp} मिलता है।"
    respx.post(CLAUDE).mock(return_value=_tool("explain", {"explanation_hi": good}))
    wrong = exp + 3
    for _ in range(2):
        r = client.post(f"/api/v1/sessions/{s['id']}/answer", headers=h,
                        json={"question_id": q["id"], "input_method": "manual", "value": wrong})
    # third wrong answer value (exp+3) is not misclassified, so AI is only used with a misconception;
    fb = r.json()["feedback"]
    assert fb["explanation_hi"]  # authored explanation always present
    # now trigger a misconception (off by one) on a fresh question
    s = r.json()["session"]
    q = s["current_question"]
    for _ in range(2):
        r = client.post(f"/api/v1/sessions/{s['id']}/answer", headers=h,
                        json={"question_id": q["id"], "input_method": "manual", "value": q["expected_answer"] + 1})
    fb = r.json()["feedback"]
    assert fb["misconception"] == "off_by_one"
    # mocked text mentions numbers from the *first* question; accepted only if they match this question
    allowed = {q["expected_answer"], q["expected_answer"] + 1, *[v for v in q["operands"].values()], 1, 10}
    if {a, b, exp} <= allowed:
        assert fb["feedback_source"] == "claude"
    else:
        assert fb["feedback_source"] == "rules"


@respx.mock
def test_draft_questions_recomputes_answers(client, teacher, claude_on):
    h = teacher["h"]
    lesson = next(le for le in client.get("/api/v1/lessons", headers=h).json() if le["skill"]["code"] == "add_within_10")
    respx.post(CLAUDE).mock(return_value=_tool("propose_questions", {"questions": [
        {"a": 4, "b": 3, "operation": "add", "prompt_hi": "थैले में 4 आम हैं और 3 आम और डाले। कुल कितने आम हुए?",
         "prompt_en": "4 mangoes and 3 more", "hint_hi": "4 के आगे गिनो।"},
        {"a": 5, "b": 2, "operation": "add", "prompt_hi": "5 और 2 और 9 जोड़ो।", "prompt_en": "bad",
         "hint_hi": "गिनो।"},  # extra number -> rejected
        {"a": 50, "b": 2, "operation": "add", "prompt_hi": "50 और 2 जोड़ो, कितना हुआ?", "prompt_en": "range",
         "hint_hi": "गिनो।"},  # out of range -> rejected
        {"a": 6, "b": 1, "operation": "sub", "prompt_hi": "6 में से 1 घटाओ, कितना बचा?", "prompt_en": "wrong op",
         "hint_hi": "गिनो।"},  # wrong operation for skill -> rejected
    ]}))
    r = client.post(f"/api/v1/lessons/{lesson['id']}/draft-questions", json={"count": 4, "difficulty": 2}, headers=h)
    assert r.status_code == 201, r.text
    v = r.json()
    assert v["status"] == "draft" and v["source"] == "ai_draft" and v["question_count"] == 16
    detail = client.get(f"/api/v1/lessons/{lesson['id']}?version_id={v['id']}", headers=h).json()
    new = detail["questions"][-1]
    assert new["expected_answer"] == 7 and new["operands"] == {"a": 4, "b": 3}
    # the draft is NOT used for sessions until a teacher reviews it
    assert client.get(f"/api/v1/lesson-packs/{lesson['id']}", headers=h).json()["version"] == 1


def test_draft_questions_without_claude(client, teacher):
    h = teacher["h"]
    lesson = next(le for le in client.get("/api/v1/lessons", headers=h).json() if le["skill"]["code"] == "add_within_10")
    r = client.post(f"/api/v1/lessons/{lesson['id']}/draft-questions", json={"count": 2}, headers=h)
    assert r.status_code == 503 and r.json()["error"]["code"] == "ai_unavailable"


# ---------------------------------------------------------------- speech ---- #
WAV = b"RIFF" + b"\x00" * 200


def test_speech_status_and_unavailable(client, teacher):
    st = client.get("/api/v1/speech/status", headers=teacher["h"]).json()
    assert st == {**st, "stt_available": False, "tts_available": False, "offline_stt": False}
    r = client.post("/api/v1/speech/transcribe", headers=teacher["h"], files={"file": ("a.wav", WAV, "audio/wav")})
    assert r.status_code == 503 and r.json()["error"]["code"] == "stt_unavailable"


@respx.mock
def test_transcribe_requires_confirmation(client, teacher, sarvam_on):
    route = respx.post(STT).mock(return_value=httpx.Response(200, json={"request_id": "r", "transcript": "पाँच",
                                                                       "language_code": "hi-IN"}))
    r = client.post("/api/v1/speech/transcribe", headers=teacher["h"], files={"file": ("a.wav", WAV, "audio/wav")})
    assert r.status_code == 200
    out = r.json()
    assert out["value"] == 5 and out["usable"] and out["needs_confirmation"] and out["confidence"] is None
    req = route.calls.last.request
    assert req.headers["api-subscription-key"] == "test-key"
    assert b"saaras:v4" in req.content and b"keyterms" in req.content


@respx.mock
def test_transcribe_ambiguous_and_bad_input(client, teacher, sarvam_on):
    respx.post(STT).mock(return_value=httpx.Response(200, json={"transcript": "तीन नहीं चार"}))
    out = client.post("/api/v1/speech/transcribe", headers=teacher["h"],
                      files={"file": ("a.wav", WAV, "audio/wav")}).json()
    assert out["usable"] is False and out["needs_retry"] is True and out["parse_status"] == "ambiguous"
    r = client.post("/api/v1/speech/transcribe", headers=teacher["h"], files={"file": ("a.webm", WAV, "audio/webm")})
    assert r.status_code == 415
    r = client.post("/api/v1/speech/transcribe", headers=teacher["h"], files={"file": ("a.wav", b"", "audio/wav")})
    assert r.json()["error"]["code"] == "empty_audio"


@respx.mock
def test_transcribe_timeout_is_reported(client, teacher, sarvam_on, monkeypatch):
    import app.speech.sarvam as sv
    monkeypatch.setattr(sv.time, "sleep", lambda *_: None)
    respx.post(STT).mock(side_effect=httpx.ConnectTimeout("down"))
    r = client.post("/api/v1/speech/transcribe", headers=teacher["h"], files={"file": ("a.wav", WAV, "audio/wav")})
    assert r.status_code == 503 and r.json()["error"]["details"]["reason"] == "timeout"


@respx.mock
def test_tts_clip_is_cached(client, teacher, sarvam_on):
    mp3 = b"ID3fake-mp3"
    route = respx.post(TTS).mock(return_value=httpx.Response(200, json={"audios": [base64.b64encode(mp3).decode()]}))
    h = teacher["h"]
    lesson = client.get("/api/v1/lessons", headers=h).json()[0]
    pack = client.get(f"/api/v1/lesson-packs/{lesson['id']}", headers=h).json()
    ref = f"q:{pack['questions'][0]['id']}:prompt"
    a = client.get(f"/api/v1/speech/clip?ref={ref}", headers=h)
    b = client.get(f"/api/v1/speech/clip?ref={ref}", headers=h)
    assert a.content == b.content == mp3 and a.headers["content-type"] == "audio/mpeg"
    assert route.call_count == 1
    sent = route.calls.last.request.content.decode()
    assert '"language_code":"hi-IN"' in sent.replace(" ", "")
    pack = client.get(f"/api/v1/lesson-packs/{lesson['id']}", headers=h).json()
    assert pack["audio_status"] == "partial" and ref in pack["audio"]
    assert client.get("/api/v1/speech/clip?ref=q:nope:prompt", headers=h).status_code == 404
