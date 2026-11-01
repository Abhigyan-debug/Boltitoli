"""Analytics computed only from recorded sessions. No estimates are presented as measurements."""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session as DB
from sqlalchemy.orm import selectinload

from app.db.base import as_utc, utcnow
from app.models import Classroom, GroupProgress, LearningGroup, School, Session, Skill, User
from app.schemas import GroupAnalytics, OverviewOut, SessionListItem
from app.services.access import school_ids_for

ENOUGH_ANSWERS = 20


def _list_item(s: Session) -> SessionListItem:
    stats = s.summary.stats if s.summary else {}
    sk = s.lesson_version.lesson.skill
    return SessionListItem(id=s.id, group_id=s.group_id, group_name=s.group.name, skill_name_hi=sk.name_hi,
                           skill_name_en=sk.name_en, status=s.status, mode=s.mode, started_at=s.started_at,
                           ended_at=s.ended_at, active_seconds=s.active_seconds,
                           questions_attempted=stats.get("questions_attempted", 0),
                           correct_first_try=stats.get("correct_first_try", 0))


def sessions_query(db: DB, school_ids: list[str], since=None, group_id: str | None = None,
                   statuses: tuple[str, ...] | None = None):
    q = (select(Session).where(Session.school_id.in_(school_ids))
         .options(selectinload(Session.summary), selectinload(Session.group))
         .order_by(Session.started_at.desc()))
    if since is not None:
        q = q.where(Session.started_at >= since)
    if group_id:
        q = q.where(Session.group_id == group_id)
    if statuses:
        q = q.where(Session.status.in_(statuses))
    return q


def overview(db: DB, user: User, days: int, school_id: str | None = None) -> OverviewOut:
    ids = school_ids_for(db, user)
    if school_id:
        ids = [i for i in ids if i == school_id]
    since = utcnow() - timedelta(days=days)
    sessions = list(db.scalars(sessions_query(db, ids, since)))
    done = [s for s in sessions if s.status == "completed"]
    attempted = sum((s.summary.stats.get("questions_attempted", 0) if s.summary else 0) for s in done)
    first = sum((s.summary.stats.get("correct_first_try", 0) if s.summary else 0) for s in done)
    recent = list(db.scalars(sessions_query(db, ids, statuses=("completed",)).limit(5)))
    is_demo = bool(ids) and all(db.get(School, i).is_demo for i in ids)  # type: ignore[union-attr]
    return OverviewOut(
        period_days=days, sessions_completed=len(done),
        practice_minutes=round(sum(s.active_seconds for s in done) / 60),
        active_groups=len({s.group_id for s in done}), questions_attempted=attempted,
        first_try_accuracy=round(100 * first / attempted, 1) if attempted else None, accuracy_sample=attempted,
        offline_sessions=sum(1 for s in done if s.mode == "offline"),
        recent_sessions=[_list_item(s) for s in recent],
        recommendation=_recommendation(db, ids) if user.role != "official" else None, is_demo=is_demo)


def _recommendation(db: DB, school_ids: list[str]) -> dict | None:
    groups = list(db.scalars(select(LearningGroup).join(Classroom)
                             .where(Classroom.school_id.in_(school_ids), LearningGroup.archived_at.is_(None),
                                    Classroom.archived_at.is_(None))))
    if not groups:
        return {"kind": "create_group", "message_hi": "पहला सीखने वाला समूह बनाइए, फिर 15 मिनट का सत्र शुरू करें।",
                "message_en": "Create your first learning group, then start a 15-minute session."}
    last: dict[str, object] = {}
    for g in groups:
        s = db.scalar(select(Session).where(Session.group_id == g.id, Session.status == "completed")
                      .order_by(Session.started_at.desc()).limit(1))
        last[g.id] = s
    never = [g for g in groups if last[g.id] is None]
    if never:
        g = never[0]
        return {"kind": "first_session", "group_id": g.id, "group_name": g.name,
                "message_hi": f"{g.name} समूह के साथ अभी तक कोई सत्र नहीं हुआ है। आज शुरू करें?",
                "message_en": f"{g.name} has not had a session yet."}
    g = min(groups, key=lambda g: as_utc(last[g.id].started_at))  # type: ignore[union-attr]
    s = last[g.id]
    days_ago = (utcnow() - as_utc(s.started_at)).days  # type: ignore[union-attr]
    nxt = s.summary.next_activity_hi if s.summary else None  # type: ignore[union-attr]
    return {"kind": "next_practice", "group_id": g.id, "group_name": g.name, "days_since": days_ago,
            "message_hi": (f"{g.name} समूह का पिछला सत्र {days_ago} दिन पहले हुआ था।" if days_ago >= 1
                           else f"{g.name} समूह के लिए अगला सुझाव:") + (f" {nxt}" if nxt else ""),
            "message_en": f"{g.name} practised {days_ago} day(s) ago."}


def group_analytics(db: DB, user: User, weeks: int = 6, school_id: str | None = None) -> list[GroupAnalytics]:
    ids = school_ids_for(db, user)
    if school_id:
        ids = [i for i in ids if i == school_id]
    groups = list(db.scalars(select(LearningGroup).join(Classroom)
                             .where(Classroom.school_id.in_(ids), LearningGroup.archived_at.is_(None))
                             .order_by(LearningGroup.created_at)))
    now = utcnow()
    since = now - timedelta(weeks=weeks)
    out: list[GroupAnalytics] = []
    for g in groups:
        sessions = list(db.scalars(sessions_query(db, ids, since, group_id=g.id, statuses=("completed",))))
        buckets: dict[int, dict] = defaultdict(lambda: {"sessions": 0, "attempted": 0, "first": 0})
        mis: Counter[str] = Counter()
        mis_label: dict[str, str] = {}
        for s in sessions:
            wk = (now - as_utc(s.started_at)).days // 7
            st = s.summary.stats if s.summary else {}
            b = buckets[wk]
            b["sessions"] += 1
            b["attempted"] += st.get("questions_attempted", 0)
            b["first"] += st.get("correct_first_try", 0)
            for m in st.get("misconceptions", []):
                mis[m["code"]] += m["count"]
                mis_label[m["code"]] = m["label_hi"]
        weekly = []
        for wk in range(weeks - 1, -1, -1):
            b = buckets.get(wk, {"sessions": 0, "attempted": 0, "first": 0})
            weekly.append({"weeks_ago": wk, "label": "This week" if wk == 0 else f"{wk}w ago",
                           "sessions": b["sessions"], "attempted": b["attempted"],
                           "first_try_accuracy": round(100 * b["first"] / b["attempted"]) if b["attempted"] else None})
        total_att = sum(b["attempted"] for b in buckets.values())
        total_first = sum(b["first"] for b in buckets.values())
        skills = []
        for gp in db.scalars(select(GroupProgress).where(GroupProgress.group_id == g.id)):
            sk = db.get(Skill, gp.skill_id)
            skills.append({"skill_id": gp.skill_id, "name_hi": sk.name_hi if sk else "",
                           "name_en": sk.name_en if sk else "",
                           "sessions": gp.sessions_count, "attempted": gp.questions_attempted,
                           "first_try_accuracy": round(100 * gp.correct_first_try / gp.questions_attempted)
                           if gp.questions_attempted else None,
                           "highest_difficulty": gp.highest_difficulty,
                           "last_session_at": gp.last_session_at})
        out.append(GroupAnalytics(
            group_id=g.id, group_name=g.name, level=g.level, weekly=weekly, skills=skills,
            misconceptions=[{"code": c, "label_hi": mis_label[c], "count": n} for c, n in mis.most_common(5)],
            questions_attempted=total_att,
            first_try_accuracy=round(100 * total_first / total_att, 1) if total_att else None,
            enough_data=total_att >= ENOUGH_ANSWERS))
    return out
