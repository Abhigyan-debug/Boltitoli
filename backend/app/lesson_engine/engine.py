"""Deterministic, rule-based adaptive lesson engine.

This module is the single source of truth for answer correctness and session
advancement. AI may *phrase* feedback or summaries, but it never decides
whether an answer is right or which question comes next.

Everything here is pure (no I/O) so it can run on the server, be mirrored in
the offline client engine, and be tested against shared fixtures
(shared/engine-fixtures.json).
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

MIN_DIFFICULTY, MAX_DIFFICULTY = 1, 3
PROMOTE_AFTER_STREAK = 2
MASTERY_STREAK = 5
UNCLEAR_BEFORE_MANUAL = 2


@dataclass(frozen=True)
class Question:
    id: str
    difficulty: int
    kind: str
    operands: dict[str, Any]
    expected_answer: int


# --------------------------------------------------------------------------- #
# Misconception detection
# --------------------------------------------------------------------------- #

MISCONCEPTIONS_HI: dict[str, str] = {
    "off_by_one": "गिनती में एक कम या एक ज़्यादा",
    "counted_one_group": "सिर्फ़ एक समूह गिना",
    "added_instead_of_subtracted": "घटाने की जगह जोड़ दिया",
    "subtracted_instead_of_added": "जोड़ने की जगह घटा दिया",
    "chose_smaller": "बड़ी की जगह छोटी संख्या चुनी",
    "tens_ones_swapped": "दहाई और इकाई में उलझन",
    "reversed_digits": "अंक उल्टे क्रम में",
    "before_after_swapped": "पहले और बाद में उलझन",
}


def _reverse_digits(n: int) -> int | None:
    s = str(abs(n))
    return int(s[::-1]) if len(s) > 1 and s[::-1] != s else None


def detect_misconception(q: Question, value: int) -> str | None:
    """Return a misconception code for a wrong answer, or None if unclassified."""
    exp = q.expected_answer
    if value == exp:
        return None
    op = q.operands
    a, b = op.get("a"), op.get("b")

    if q.kind in ("add", "word_add") and a is not None and b is not None:
        if value == abs(a - b):
            return "subtracted_instead_of_added"
        if value in (a, b):
            return "counted_one_group"
    if q.kind in ("sub", "word_sub") and a is not None and b is not None and value == a + b:
        return "added_instead_of_subtracted"
    if q.kind == "compare" and a is not None and b is not None and value == min(a, b):
        return "chose_smaller"
    if q.kind == "place_value":
        n = op.get("n")
        if n is not None:
            tens, ones = divmod(n, 10)
            asked = op.get("ask")
            if (asked == "tens" and value == ones) or (asked == "ones" and value == tens):
                return "tens_ones_swapped"
    if q.kind == "before_after" and op.get("n") is not None:
        n, ask = op["n"], op.get("ask")
        if (ask == "after" and value == n - 1) or (ask == "before" and value == n + 1):
            return "before_after_swapped"
    if _reverse_digits(exp) == value:
        return "reversed_digits"
    if abs(value - exp) == 1:
        return "off_by_one"
    return None


def evaluate(q: Question, value: int | None) -> tuple[str, str | None]:
    """Return (outcome, misconception). outcome: correct | incorrect | unclear."""
    if value is None:
        return "unclear", None
    if value == q.expected_answer:
        return "correct", None
    return "incorrect", detect_misconception(q, value)


# --------------------------------------------------------------------------- #
# Session state machine
# --------------------------------------------------------------------------- #


@dataclass
class EngineState:
    current_question_id: str | None = None
    difficulty: int = MIN_DIFFICULTY
    attempt: int = 1
    streak: int = 0
    first_try_streak: int = 0
    unclear_count: int = 0
    asked: list[str] = field(default_factory=list)
    highest_difficulty: int = MIN_DIFFICULTY
    questions_completed: int = 0
    mastery_signal: bool = False

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict[str, Any] | None) -> EngineState:
        if not d:
            return cls()
        known = {k: v for k, v in d.items() if k in cls.__dataclass_fields__}
        return cls(**known)


@dataclass(frozen=True)
class Decision:
    action: str  # next | harder | easier | retry_with_hint | ask_again | exhausted
    outcome: str
    misconception: str | None
    next_question_id: str | None
    show_hint: bool = False
    show_explanation: bool = False
    suggest_manual: bool = False
    mastery_signal: bool = False


def pick_question(questions: list[Question], difficulty: int, asked: list[str],
                  exclude: str | None = None) -> str | None:
    """Pick the next question for the target difficulty.

    Order of preference:
      1. an unasked question at the target difficulty;
      2. the least recently asked question at the target difficulty (repetition
         at the right level is better than drifting to a harder level);
      3. an unasked question at the nearest other difficulty, easier first;
      4. the least recently asked question anywhere.
    The question just shown (`exclude`) is never picked twice in a row unless
    it is the only question.
    """
    if not questions:
        return None
    asked_set = set(asked)
    last_seen = {qid: i for i, qid in enumerate(asked)}
    at_target = [q for q in questions if q.difficulty == difficulty and q.id != exclude]

    for q in at_target:
        if q.id not in asked_set:
            return q.id
    if at_target:
        return min(at_target, key=lambda q: last_seen.get(q.id, -1)).id
    for delta in (-1, 1, -2, 2):
        for q in questions:
            if q.difficulty == difficulty + delta and q.id not in asked_set and q.id != exclude:
                return q.id
    pool = [q for q in questions if q.id != exclude] or questions
    return min(pool, key=lambda q: (last_seen.get(q.id, -1), abs(q.difficulty - difficulty))).id


def start(questions: list[Question], start_difficulty: int = MIN_DIFFICULTY) -> EngineState:
    st = EngineState(difficulty=start_difficulty, highest_difficulty=start_difficulty)
    st.current_question_id = pick_question(questions, st.difficulty, st.asked)
    if st.current_question_id:
        st.asked.append(st.current_question_id)
    return st


def _advance(st: EngineState, questions: list[Question]) -> str | None:
    qid = pick_question(questions, st.difficulty, st.asked, exclude=st.current_question_id)
    st.current_question_id = qid
    st.attempt = 1
    st.unclear_count = 0
    if qid:
        st.asked.append(qid)
    return qid


def apply_outcome(st: EngineState, questions: list[Question], outcome: str,
                  misconception: str | None = None) -> Decision:
    """Mutate `st` according to the rules and return what happens next."""
    if outcome == "unclear":
        st.unclear_count += 1
        return Decision("ask_again", outcome, None, st.current_question_id,
                        suggest_manual=st.unclear_count >= UNCLEAR_BEFORE_MANUAL)

    if outcome == "skipped":
        st.streak = 0
        nxt = _advance(st, questions)
        return Decision("next", outcome, None, nxt)

    if outcome == "correct":
        first_try = st.attempt == 1
        st.questions_completed += 1
        action = "next"
        if first_try:
            st.streak += 1
            st.first_try_streak += 1
            if st.streak >= PROMOTE_AFTER_STREAK and st.difficulty < MAX_DIFFICULTY:
                st.difficulty += 1
                st.highest_difficulty = max(st.highest_difficulty, st.difficulty)
                st.streak = 0
                action = "harder"
        else:
            st.streak = 0
            st.first_try_streak = 0
        if st.difficulty == MAX_DIFFICULTY and st.first_try_streak >= MASTERY_STREAK:
            st.mastery_signal = True
        nxt = _advance(st, questions)
        return Decision(action, outcome, None, nxt, mastery_signal=st.mastery_signal)

    # incorrect
    st.streak = 0
    st.first_try_streak = 0
    if st.attempt == 1:
        st.attempt = 2
        st.unclear_count = 0
        return Decision("retry_with_hint", outcome, misconception, st.current_question_id, show_hint=True)

    st.questions_completed += 1
    action = "next"
    if st.difficulty > MIN_DIFFICULTY:
        st.difficulty -= 1
        action = "easier"
    nxt = _advance(st, questions)
    return Decision(action, outcome, misconception, nxt, show_explanation=True)


def adjust(st: EngineState, questions: list[Question], delta: int) -> Decision:
    """Teacher asks for an easier (-1) or harder (+1) question. Not graded."""
    st.difficulty = max(MIN_DIFFICULTY, min(MAX_DIFFICULTY, st.difficulty + delta))
    st.highest_difficulty = max(st.highest_difficulty, st.difficulty)
    st.streak = 0
    nxt = _advance(st, questions)
    return Decision("easier" if delta < 0 else "harder", "skipped", None, nxt)
