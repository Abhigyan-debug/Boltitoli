"""Lesson engine + Hindi parser, checked against the shared fixtures that the
TypeScript offline engine also uses."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.lesson_engine import engine
from app.lesson_engine.engine import Question
from app.lesson_engine.hindi_numbers import parse_answer, stt_keyterms
from app.services.lesson_service import CONTENT

FIX = json.loads((Path(__file__).resolve().parents[2] / "shared" / "engine-fixtures.json").read_text("utf-8"))


@pytest.mark.parametrize("case", FIX["parse"], ids=lambda c: repr(c["text"]))
def test_parse_fixtures(case):
    p = parse_answer(case["text"])
    assert (p.value, p.status) == (case["value"], case["status"])


@pytest.mark.parametrize("case", FIX["misconceptions"], ids=lambda c: f"{c['question']['kind']}-{c['value']}")
def test_misconception_fixtures(case):
    q = Question(**case["question"])
    assert engine.detect_misconception(q, case["value"]) == case["code"]


@pytest.mark.parametrize("scenario", FIX["scenarios"], ids=lambda s: s["name"])
def test_scenario_fixtures(scenario):
    qs = [Question(**q) for q in FIX["questions"]]
    st = engine.start(qs)
    assert st.current_question_id == scenario["steps"][0]["start_question_id"]
    for step in scenario["steps"][1:]:
        d = engine.apply_outcome(st, qs, step["outcome"], None)
        assert d.action == step["action"]
        assert d.next_question_id == step["next_question_id"]
        assert st.difficulty == step["difficulty"]
        assert st.attempt == step["attempt"]
        assert d.suggest_manual == step["suggest_manual"]
        assert d.mastery_signal == step["mastery_signal"]


def test_uncertain_answer_is_never_correct():
    q = Question("q", 1, "add", {"a": 2, "b": 3}, 5)
    assert engine.evaluate(q, None) == ("unclear", None)


def test_state_roundtrip_ignores_unknown_keys():
    st = engine.EngineState.from_dict({"difficulty": 2, "streak": 1, "bogus": True})
    assert st.difficulty == 2 and st.streak == 1


def test_keyterms_within_sarvam_limit():
    terms = stt_keyterms(100)
    assert 0 < len(terms) <= 50 and all(len(t) <= 64 for t in terms)


def test_lesson_content_answers_are_consistent():
    """Every authored question's answer must be derivable from its operands."""
    data = json.loads(CONTENT.read_text("utf-8"))
    checked = 0
    for item in data:
        for q in item["lesson"]["questions"]:
            op, k, ans = q["operands"], q["kind"], q["expected_answer"]
            if k in ("add", "word_add"):
                assert ans == op["a"] + op["b"]
            elif k in ("sub", "word_sub"):
                assert ans == op["a"] - op["b"] and ans >= 0
            elif k == "compare":
                assert ans == max(op["a"], op["b"])
            elif k == "count":
                assert ans == op["n"]
            elif k == "place_value":
                assert ans == (op["n"] // 10 if op["ask"] == "tens" else op["n"] % 10)
            elif k == "before_after":
                assert ans == op["n"] + (1 if op["ask"] == "after" else -1)
            else:
                pytest.fail(f"unknown kind {k}")
            checked += 1
        diffs = {q["difficulty"] for q in item["lesson"]["questions"]}
        assert diffs == {1, 2, 3}, item["skill"]["code"]
    assert checked >= 100


def test_visual_quantities_match_question():
    """The 3D/2D illustration must agree with the question."""
    data = json.loads(CONTENT.read_text("utf-8"))
    for item in data:
        for q in item["lesson"]["questions"]:
            v = q["visual"]
            if not v:
                continue
            if v["type"] == "objects":
                if q["kind"] == "count":
                    assert v["groups"] == [q["operands"]["n"]]
                elif q["kind"] == "add":
                    assert v["groups"] == [q["operands"]["a"], q["operands"]["b"]]
                elif q["kind"] == "sub":
                    assert v["groups"] == [q["operands"]["a"]] and v["remove"] == q["operands"]["b"]
            if v["type"] == "bundles" and q["kind"] == "place_value":
                assert v["tens"] * 10 + v["ones"] == q["operands"]["n"]
