"""SessionSummaryService.

Statistics and the level suggestion are computed deterministically from the
recorded responses. Claude (when configured) only rewrites those facts as a
short Hindi paragraph; its output is rejected if it mentions any number that
is not in the statistics.
"""

from __future__ import annotations

import logging
import re
from collections import Counter, defaultdict
from typing import Any

from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session as DB

from app.ai import claude_client
from app.ai.claude_client import ProviderError
from app.core.config import get_settings
from app.db.base import as_utc
from app.lesson_engine.engine import MISCONCEPTIONS_HI
from app.models import GroupProgress, Session, SessionSummary, Skill

log = logging.getLogger("boltitoli.summary")

MIN_EVIDENCE = 8  # questions before suggesting any level review


def compute_stats(session: Session) -> dict[str, Any]:
    instances: dict[int, list] = defaultdict(list)
    methods: Counter[str] = Counter()
    unclear = 0
    for r in session.responses:
        if r.outcome == "unclear":
            unclear += 1
            continue
        instances[r.sequence_no].append(r)
        methods[r.input_method] += 1

    attempted = first = after_hint = not_yet = skipped = 0
    by_diff: dict[int, dict[str, int]] = {d: {"attempted": 0, "correct_first_try": 0} for d in (1, 2, 3)}
    miscon: Counter[str] = Counter()
    highest = 1
    for _, rs in sorted(instances.items()):
        rs.sort(key=lambda r: (r.attempt_no, as_utc(r.created_at)))
        final = rs[-1]
        if final.outcome == "skipped":
            skipped += 1
            continue
        attempted += 1
        d = rs[0].difficulty
        highest = max(highest, d)
        by_diff[d]["attempted"] += 1
        if rs[0].outcome == "correct" and rs[0].attempt_no == 1:
            first += 1
            by_diff[d]["correct_first_try"] += 1
        elif final.outcome == "correct":
            after_hint += 1
        else:
            not_yet += 1
        for r in rs:
            if r.misconception:
                miscon[r.misconception] += 1

    minutes = round((session.active_seconds or 0) / 60)
    return {
        "minutes": minutes,
        "planned_minutes": session.planned_minutes,
        "questions_attempted": attempted,
        "correct_first_try": first,
        "correct_after_hint": after_hint,
        "not_yet": not_yet,
        "skipped": skipped,
        "unclear_responses": unclear,
        "first_try_accuracy_pct": round(100 * first / attempted) if attempted else None,
        "by_difficulty": {str(k): v for k, v in by_diff.items()},
        "highest_difficulty": highest,
        "misconceptions": [{"code": c, "label_hi": MISCONCEPTIONS_HI.get(c, c), "count": n}
                           for c, n in miscon.most_common(3)],
        "input_methods": dict(methods),
        "mastery_signal": bool((session.engine_state or {}).get("mastery_signal")),
        "mode": session.mode,
    }


def level_suggestion(stats: dict[str, Any]) -> tuple[str, str | None]:
    n = stats["questions_attempted"]
    if n < MIN_EVIDENCE:
        return "keep", None
    acc = stats["first_try_accuracy_pct"] or 0
    hard = stats["by_difficulty"]["3"]
    hard_acc = hard["correct_first_try"] / hard["attempted"] if hard["attempted"] else 0
    if acc >= 85 and hard["attempted"] >= 4 and hard_acc >= 0.75:
        return "review_up", (f"इस सत्र में {n} में से {stats['correct_first_try']} सवाल पहली बार में सही रहे, "
                             f"मुश्किल सवालों में भी। अगर पिछले सत्रों में भी ऐसा रहा है, तो अगला कौशल शुरू करने पर विचार करें।")
    if acc < 40:
        return "review_down", (f"इस सत्र में {n} में से केवल {stats['correct_first_try']} सवाल पहली बार में सही रहे। "
                               "आसान स्तर पर कुछ और अभ्यास या आपकी मदद उपयोगी हो सकती है।")
    return "keep", None


def next_activity(db: DB, session: Session, stats: dict[str, Any], suggestion: str) -> str:
    skill = session.lesson_version.lesson.skill
    if suggestion == "review_up" or stats["mastery_signal"]:
        nxt = db.scalar(select(Skill).where(Skill.sort_order > skill.sort_order).order_by(Skill.sort_order))
        if nxt:
            return f"अगला कौशल आज़माएँ: “{nxt.name_hi}”। पहले 2–3 आसान सवालों से शुरू करें।"
    if stats["misconceptions"]:
        top = stats["misconceptions"][0]["label_hi"]
        return f"अगले सत्र में “{skill.name_hi}” दोहराएँ और इस पर ध्यान दें: {top}। ठोस चीज़ों (तीलियाँ, कंकड़) से गिनवाएँ।"
    if suggestion == "review_down":
        return f"“{skill.name_hi}” के आसान सवालों से फिर अभ्यास करें, और 5 मिनट समूह के साथ खुद बैठें।"
    return f"अगले सत्र में भी “{skill.name_hi}” का अभ्यास जारी रखें।"


def rules_summary(group_name: str, skill_name_hi: str, stats: dict[str, Any]) -> str:
    n = stats["questions_attempted"]
    if n == 0:
        return (f"आज {group_name} समूह के साथ “{skill_name_hi}” का सत्र शुरू हुआ, "
                "लेकिन किसी सवाल का जवाब दर्ज नहीं हुआ। इसलिए इस सत्र से कोई निष्कर्ष नहीं निकाला जा सकता।")
    parts = [f"आज {group_name} समूह ने “{skill_name_hi}” का {stats['minutes']} मिनट अभ्यास किया।",
             f"{n} सवाल किए गए: {stats['correct_first_try']} पहली बार में सही, "
             f"{stats['correct_after_hint']} संकेत के बाद सही, और {stats['not_yet']} में अभी और अभ्यास चाहिए।"]
    if stats["misconceptions"]:
        m = stats["misconceptions"][0]
        parts.append(f"सबसे ज़्यादा दिखी कठिनाई: {m['label_hi']} ({m['count']} बार)।")
    if stats["unclear_responses"]:
        parts.append(f"{stats['unclear_responses']} बार जवाब साफ़ सुनाई नहीं दिया; उन्हें गिना नहीं गया।")
    if n < MIN_EVIDENCE:
        parts.append("सवाल कम होने के कारण यह सिर्फ़ एक झलक है, पक्का निष्कर्ष नहीं।")
    return " ".join(parts)


class _AISummary(BaseModel):
    summary_hi: str = Field(min_length=20, max_length=600)
    next_activity_hi: str = Field(min_length=10, max_length=300)


_SYSTEM = (
    "You write short session notes in simple Hindi (Devanagari) for a government primary school teacher in India. "
    "You receive statistics about one 15-minute guided maths practice session with a small group of children. "
    "Rules: use ONLY facts and numbers present in the statistics; never invent numbers, names or claims; "
    "do not judge or label children; say 'group' not individual children; keep it warm, practical and under 4 "
    "sentences; the teacher makes all decisions, so phrase recommendations as suggestions. "
    "If there are fewer than 8 questions attempted, say the evidence is limited."
)


def _numbers_in(obj: Any) -> set[int]:
    out: set[int] = set()
    if isinstance(obj, bool):
        return out
    if isinstance(obj, int | float):
        out.add(int(obj))
    elif isinstance(obj, dict):
        for v in obj.values():
            out |= _numbers_in(v)
    elif isinstance(obj, list):
        for v in obj:
            out |= _numbers_in(v)
    return out


_DIGITS = re.compile(r"[0-9०-९]+")
_DEV = str.maketrans("०१२३४५६७८९", "0123456789")


def numbers_grounded(text: str, allowed: set[int]) -> bool:
    return all(int(m.translate(_DEV)) in allowed for m in _DIGITS.findall(text))


def claude_summary(skill_name_hi: str, stats: dict[str, Any], suggested_next: str) -> _AISummary | None:
    if not claude_client.is_available():
        return None
    s = get_settings()
    facts = {"skill": skill_name_hi, **{k: v for k, v in stats.items() if k != "mode"},
             "deterministic_next_activity": suggested_next}
    import json
    try:
        raw = claude_client.call_tool(
            model=s.anthropic_model_summary, system=_SYSTEM,
            user="Session statistics (JSON):\n" + json.dumps(facts, ensure_ascii=False),
            tool_name="write_teacher_summary",
            tool_description="Return the Hindi teacher summary and the suggested next activity.",
            input_schema={"type": "object", "required": ["summary_hi", "next_activity_hi"], "properties": {
                "summary_hi": {"type": "string", "description": "2-4 short Hindi sentences"},
                "next_activity_hi": {"type": "string", "description": "One Hindi sentence, a suggestion"}}},
            max_tokens=600)
        out = _AISummary.model_validate(raw)
    except (ProviderError, ValidationError) as e:
        log.info("claude_summary_fallback", extra={"reason": getattr(e, "code", "validation")})
        return None
    allowed = _numbers_in(stats) | {1, 2, 3, 4, 5, 10, 15}
    if not (numbers_grounded(out.summary_hi, allowed) and numbers_grounded(out.next_activity_hi, allowed)):
        log.info("claude_summary_rejected", extra={"reason": "ungrounded_numbers"})
        return None
    return out


def build_summary(db: DB, session: Session, use_ai: bool = True) -> SessionSummary:
    if session.summary:
        return session.summary
    stats = compute_stats(session)
    suggestion, reason = level_suggestion(stats)
    nxt = next_activity(db, session, stats, suggestion)
    skill = session.lesson_version.lesson.skill
    summary_text = rules_summary(session.group.name, skill.name_hi, stats)
    generated_by = "rules"
    if use_ai and stats["questions_attempted"] > 0:
        ai = claude_summary(skill.name_hi, stats, nxt)
        if ai:
            summary_text, nxt, generated_by = ai.summary_hi, ai.next_activity_hi, "claude"
    summ = SessionSummary(session_id=session.id, stats=stats, summary_hi=summary_text, next_activity_hi=nxt,
                          level_suggestion=suggestion, level_suggestion_reason_hi=reason,
                          generated_by=generated_by)
    db.add(summ)
    session.summary = summ
    _update_progress(db, session, stats)
    return summ


def _update_progress(db: DB, session: Session, stats: dict[str, Any]) -> None:
    skill_id = session.lesson_version.lesson.skill_id
    gp = db.scalar(select(GroupProgress).where(GroupProgress.group_id == session.group_id,
                                               GroupProgress.skill_id == skill_id))
    if not gp:
        gp = GroupProgress(group_id=session.group_id, skill_id=skill_id, sessions_count=0, questions_attempted=0,
                           correct_first_try=0, correct_total=0, highest_difficulty=1)
        db.add(gp)
    gp.sessions_count += 1
    gp.questions_attempted += stats["questions_attempted"]
    gp.correct_first_try += stats["correct_first_try"]
    gp.correct_total += stats["correct_first_try"] + stats["correct_after_hint"]
    gp.highest_difficulty = max(gp.highest_difficulty, stats["highest_difficulty"])
    gp.last_session_at = session.ended_at or session.started_at
