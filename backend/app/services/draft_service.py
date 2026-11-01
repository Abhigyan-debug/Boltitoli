"""LessonService (AI drafting): Claude proposes extra practice questions.

Safety design:
- Claude only proposes operands and Hindi wording; the expected answer is
  always recomputed here from the operands.
- Every number in the Hindi prompt must be one of the operands.
- Operand ranges are constrained per skill.
- Results are saved as a *draft* lesson version that a teacher must review
  before it is used in any session.
"""

from __future__ import annotations

import json
import logging

from pydantic import BaseModel, Field, ValidationError
from sqlalchemy.orm import Session as DB

from app.ai import claude_client
from app.ai.claude_client import ProviderError
from app.core.config import get_settings
from app.core.errors import AppError, ProviderUnavailable
from app.models import Lesson, LessonVersion, User
from app.services import lesson_service
from app.services.summary_service import numbers_grounded

log = logging.getLogger("boltitoli.draft")

# skill code -> (kind, a-range, b-range)
SUPPORTED: dict[str, tuple[str, tuple[int, int], tuple[int, int]]] = {
    "add_within_10": ("add", (1, 9), (1, 9)),
    "sub_within_10": ("sub", (2, 10), (1, 9)),
    "sub_within_20": ("sub", (10, 20), (1, 10)),
    "compare_within_20": ("compare", (1, 20), (1, 20)),
    "add_two_digit": ("add", (10, 60), (10, 39)),
    "word_problems_20": ("word", (2, 20), (1, 10)),
}


class _Draft(BaseModel):
    a: int
    b: int
    operation: str = Field(pattern="^(add|sub|compare)$")
    prompt_hi: str = Field(min_length=8, max_length=220)
    prompt_en: str = Field(min_length=4, max_length=220)
    hint_hi: str = Field(min_length=5, max_length=200)


def _expected(kind: str, a: int, b: int) -> int:
    return {"add": a + b, "sub": a - b, "compare": max(a, b)}[kind]


def draft_questions(db: DB, user: User, lesson: Lesson, count: int, difficulty: int) -> LessonVersion:
    code = lesson.skill.code
    if code not in SUPPORTED:
        raise AppError("AI drafting is not available for this skill yet.", code="draft_unsupported")
    if not claude_client.is_available():
        raise ProviderUnavailable("Claude is not configured, so new questions cannot be drafted.",
                                  code="ai_unavailable")
    kind, (a_lo, a_hi), (b_lo, b_hi) = SUPPORTED[code]
    base = lesson_service.active_version(db, lesson)
    examples = [{"prompt_hi": q.prompt_hi, "operands": q.operands} for q in base.questions[:4]]
    system = ("You write practice questions in simple spoken Hindi (Devanagari) for children aged 6-9 in Indian "
              "government schools. Use everyday rural and town contexts (fruits, marbles, goats, chalk, rotis). "
              "Use digits for numbers. No violence, no brands, no real people. Each question must use exactly "
              "the two numbers a and b and nothing else numeric.")
    user_msg = (f"Skill: {lesson.skill.name_en} ({lesson.skill.name_hi}). Difficulty {difficulty} of 3.\n"
                f"Write {count} new questions. Constraints: a in [{a_lo},{a_hi}], b in [{b_lo},{b_hi}]"
                + (", a > b for subtraction" if kind in ("sub", "word") else "") +
                f".\nExisting examples (do not repeat): {json.dumps(examples, ensure_ascii=False)}")
    schema = {"type": "object", "required": ["questions"], "properties": {"questions": {
        "type": "array", "items": {"type": "object",
                                   "required": ["a", "b", "operation", "prompt_hi", "prompt_en", "hint_hi"],
                                   "properties": {"a": {"type": "integer"}, "b": {"type": "integer"},
                                                  "operation": {"type": "string", "enum": ["add", "sub", "compare"]},
                                                  "prompt_hi": {"type": "string"}, "prompt_en": {"type": "string"},
                                                  "hint_hi": {"type": "string"}}}}}}
    try:
        raw = claude_client.call_tool(model=get_settings().anthropic_model_summary, system=system, user=user_msg,
                                      tool_name="propose_questions", tool_description="Return proposed questions.",
                                      input_schema=schema, max_tokens=2000)
    except ProviderError as e:
        raise ProviderUnavailable("Claude did not respond. Try again later.", code="ai_unavailable",
                                  details={"reason": e.code}) from e

    accepted: list[dict] = []
    rejected = 0
    for item in (raw.get("questions") or [])[:count]:
        try:
            d = _Draft.model_validate(item)
        except ValidationError:
            rejected += 1
            continue
        op = d.operation
        if kind in ("add", "sub", "compare") and op != kind:
            rejected += 1
            continue
        if not (a_lo <= d.a <= a_hi and b_lo <= d.b <= b_hi) or (op == "sub" and d.a <= d.b):
            rejected += 1
            continue
        if not numbers_grounded(d.prompt_hi, {d.a, d.b}) or str(d.a) not in d.prompt_hi or str(d.b) not in d.prompt_hi:
            rejected += 1
            continue
        ans = _expected(op, d.a, d.b)
        q_kind = {"add": "add", "sub": "sub", "compare": "compare"}[op]
        if kind == "word":
            q_kind = "word_add" if op == "add" else "word_sub"
        sym = {"add": "+", "sub": "−"}.get(op)
        expl = (f"{d.a} {sym} {d.b} = {ans}।" if sym else f"{max(d.a, d.b)} बड़ा है।")
        accepted.append({"difficulty": difficulty, "kind": q_kind, "prompt_hi": d.prompt_hi, "prompt_en": d.prompt_en,
                         "operands": {"a": d.a, "b": d.b}, "expected_answer": ans, "hint_hi": d.hint_hi,
                         "explanation_hi": expl, "visual": None})
    if not accepted:
        raise AppError("None of the drafted questions passed the safety checks. Try again.", code="draft_rejected",
                       details={"rejected": rejected})
    log.info("draft_questions", extra={"accepted": len(accepted), "rejected": rejected})
    return lesson_service.create_draft_version(db, user, lesson, accepted, source="ai_draft")
