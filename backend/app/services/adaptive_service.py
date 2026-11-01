"""AdaptiveLearningService: turns an engine Decision into child-facing Hindi feedback.

Correctness and the next question always come from the deterministic engine.
Claude may optionally re-phrase the explanation for a detected misconception;
the result is discarded unless it only mentions numbers from the question.
"""

from __future__ import annotations

import logging

from pydantic import BaseModel, Field, ValidationError

from app.ai import claude_client
from app.ai.claude_client import ProviderError
from app.core.config import get_settings
from app.lesson_engine.engine import MISCONCEPTIONS_HI, Decision
from app.models import LessonQuestion
from app.services.summary_service import numbers_grounded

log = logging.getLogger("boltitoli.adaptive")

PRAISE = ["बहुत बढ़िया! सही जवाब।", "शाबाश! बिल्कुल सही।", "वाह! सही उत्तर।", "सही! तुम सबने मिलकर सोचा।"]

# Fixed phrases are also pre-generated as audio for offline packs.
PHRASES: dict[str, str] = {
    "praise_0": PRAISE[0], "praise_1": PRAISE[1], "praise_2": PRAISE[2], "praise_3": PRAISE[3],
    "after_hint": "सही! संकेत के बाद तुमने सही जवाब दिया।",
    "harder": "अब थोड़ा मुश्किल सवाल।",
    "try_again": "करीब हो! एक बार फिर सोचो।",
    "lets_learn": "कोई बात नहीं। चलो साथ में समझते हैं।",
    "easier": "अब एक आसान सवाल।",
    "unclear": "मुझे जवाब ठीक से सुनाई नहीं दिया। एक बार फिर से एक साथ बोलो।",
    "unclear_manual": "जवाब साफ़ सुनाई नहीं दिया। शिक्षक या टोली-लीडर जवाब लिख सकते हैं।",
    "skipped": "ठीक है, अगला सवाल।",
    "complete": "आज का अभ्यास पूरा हुआ। तुम सबने अच्छा ध्यान दिया। अब अपनी शिक्षिका को बताओ।",
}


def message_for(decision: Decision, sequence_no: int, attempt_before: int) -> str:
    """Child-facing Hindi line for a decision. `attempt_before` is the attempt that was just answered."""
    a = decision.action
    if decision.outcome == "correct":
        base = PHRASES["after_hint"] if attempt_before > 1 else PRAISE[sequence_no % len(PRAISE)]
        return f"{base} {PHRASES['harder']}" if a == "harder" else base
    if decision.outcome == "unclear":
        return PHRASES["unclear_manual"] if decision.suggest_manual else PHRASES["unclear"]
    if decision.outcome == "skipped":
        return PHRASES["skipped"]
    if a == "retry_with_hint":
        return PHRASES["try_again"]
    msg = PHRASES["lets_learn"]
    return f"{msg} {PHRASES['easier']}" if a == "easier" else msg


class _AIExplanation(BaseModel):
    explanation_hi: str = Field(min_length=10, max_length=220)


_SYSTEM = (
    "You help a Hindi-speaking group of children aged 6-9 who answered a maths question incorrectly. "
    "Write ONE or TWO very short, warm sentences in simple spoken Hindi (Devanagari) that show how to "
    "reach the correct answer step by step. Use only the numbers given. Do not shame, do not use English, "
    "do not mention individual children, no emojis."
)


def ai_explanation(q: LessonQuestion, given: int | None, misconception: str | None) -> str | None:
    s = get_settings()
    if not claude_client.is_available():
        return None
    allowed = {q.expected_answer} | {int(v) for v in q.operands.values() if isinstance(v, int)} | {1, 10}
    if given is not None:
        allowed.add(given)
    prompt = (f"सवाल: {q.prompt_hi}\nसही उत्तर: {q.expected_answer}\nसमूह का उत्तर: {given}\n"
              f"संभावित कठिनाई: {MISCONCEPTIONS_HI.get(misconception or '', 'अज्ञात')}\n"
              f"शिक्षक द्वारा लिखा संकेत (इसी भावना में रहें): {q.explanation_hi}")
    try:
        raw = claude_client.call_tool(
            model=s.anthropic_model_feedback, system=_SYSTEM, user=prompt, tool_name="explain",
            tool_description="Return the short Hindi explanation.",
            input_schema={"type": "object", "required": ["explanation_hi"],
                          "properties": {"explanation_hi": {"type": "string"}}},
            max_tokens=200, timeout=s.anthropic_feedback_timeout_seconds, max_retries=0)
        out = _AIExplanation.model_validate(raw)
    except (ProviderError, ValidationError):
        return None
    if not numbers_grounded(out.explanation_hi, allowed):
        log.info("ai_explanation_rejected", extra={"reason": "ungrounded_numbers"})
        return None
    return out.explanation_hi
