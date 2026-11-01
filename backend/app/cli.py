"""Management commands.

  python -m app.cli seed            # load the starter skill/lesson library (idempotent)
  python -m app.cli seed-demo       # create the clearly-labelled demo school with simulated sessions
  python -m app.cli create-official --email x@y --name "CRC Name" --school <school_id> [...]
  python -m app.cli apply-retention # delete sessions older than each school's retention period
"""

from __future__ import annotations

import argparse
import random
import secrets
from datetime import timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session as DB

from app.core.security import hash_password
from app.db.base import as_utc, utcnow
from app.db.session import SessionLocal
from app.lesson_engine import engine
from app.models import (
    Classroom,
    LearningGroup,
    LessonQuestion,
    OfficialAccess,
    School,
    Session,
    SessionResponse,
    Skill,
    User,
)
from app.services import lesson_service, summary_service
from app.services.access import audit

DEMO_EMAIL = "demo@boltitoli.app"
DEMO_MAX_AGE_HOURS = 24

# group name, level, size, skill code, P(correct) at difficulty 1/2/3
DEMO_GROUPS = [
    ("उड़ान", "beginner", 8, "count_to_10", (0.8, 0.6, 0.45)),
    ("प्रगति", "developing", 7, "add_within_10", (0.9, 0.75, 0.6)),
    ("तरंग", "advancing", 6, "sub_within_10", (0.95, 0.85, 0.75)),
]


def seed(db: DB) -> None:
    n = lesson_service.seed_library(db)
    print(f"library ready ({n} new lessons)")


def _simulate(db: DB, school: School, group: LearningGroup, teacher: User, probs: tuple, when, rng) -> None:
    lesson = lesson_service.lesson_for_skill(db, group.current_skill_id)  # type: ignore[arg-type]
    version = lesson_service.active_version(db, lesson)
    qs = lesson_service.engine_questions(version)
    st = engine.start(qs)
    s = Session(group_id=group.id, lesson_version_id=version.id, teacher_id=teacher.id, school_id=school.id,
                status="completed", mode=rng.choice(["online", "online", "offline"]), planned_minutes=15,
                started_at=when, ended_at=when + timedelta(minutes=15), active_seconds=rng.randint(780, 900))
    db.add(s)
    db.flush()
    qmap = {q.id: q for q in version.questions}
    t = when
    for _ in range(rng.randint(12, 18)):
        q: LessonQuestion = qmap[st.current_question_id]  # type: ignore[index]
        correct = rng.random() < probs[q.difficulty - 1] + (0.15 if st.attempt == 2 else 0)
        if correct:
            value = q.expected_answer
        else:
            ops = q.operands
            candidates = [q.expected_answer + 1, max(0, q.expected_answer - 1)]
            if "a" in ops and "b" in ops:
                candidates += [ops["a"] + ops["b"], abs(ops["a"] - ops["b"])]
            value = rng.choice([c for c in candidates if c != q.expected_answer])
        eq = engine.Question(q.id, q.difficulty, q.kind, q.operands, q.expected_answer)
        outcome, mis = engine.evaluate(eq, value)
        seq, att = len(st.asked), st.attempt
        engine.apply_outcome(st, qs, outcome, mis)
        t += timedelta(seconds=rng.randint(35, 70))
        db.add(SessionResponse(session_id=s.id, question_id=q.id, sequence_no=seq, attempt_no=att,
                               difficulty=q.difficulty, input_method=rng.choice(["voice", "manual", "leader"]),
                               answer_value=value, confirmed=True, outcome=outcome, misconception=mis,
                               idempotency_key=f"demo-{secrets.token_hex(12)}", feedback={"source": "demo"},
                               created_at=t))
    s.engine_state = st.to_dict()
    db.flush()
    db.refresh(s)
    summary_service.build_summary(db, s, use_ai=False)


def seed_demo(db: DB, reset: bool = False) -> User:
    seed(db)
    user = db.scalar(select(User).where(User.email == DEMO_EMAIL))
    if user and not reset:
        school = db.get(School, user.school_id) if user.school_id else None
        # the public demo is rebuilt once a day, so visitors' changes never pile up
        if school and as_utc(school.created_at) > utcnow() - timedelta(hours=DEMO_MAX_AGE_HOURS):
            return user
    if user:
        old_school_id = user.school_id
        db.execute(delete(User).where(User.id == user.id))
        if old_school_id:
            # SQL delete so the database cascades to classrooms, groups, sessions and summaries
            db.execute(delete(School).where(School.id == old_school_id))
        db.commit()
    school = School(name="डेमो प्राथमिक विद्यालय (Demo)", district="Demo district", block="Demo block", is_demo=True)
    db.add(school)
    db.flush()
    user = User(email=DEMO_EMAIL, password_hash=hash_password(secrets.token_urlsafe(24)),
                full_name="डेमो शिक्षिका", role="school_admin", school_id=school.id, onboarding_completed=True)
    db.add(user)
    room = Classroom(school_id=school.id, name="कक्षा 1–3 (बहुकक्षा)", grades="1-3", created_by=user.id)
    db.add(room)
    db.flush()
    rng = random.Random(42)  # noqa: S311 - deterministic demo simulation, not security
    now = utcnow().replace(hour=4, minute=30, second=0, microsecond=0)  # 10:00 IST
    for name, level, size, code, probs in DEMO_GROUPS:
        skill = db.scalar(select(Skill).where(Skill.code == code))
        g = LearningGroup(classroom_id=room.id, name=name, level=level, size=size, current_skill_id=skill.id)  # type: ignore[union-attr]
        db.add(g)
        db.flush()
        for days_ago in sorted(rng.sample(range(1, 27), 7), reverse=True):
            # learning improves gently over the weeks in the simulation
            boost = (27 - days_ago) / 27 * 0.12
            _simulate(db, school, g, user, tuple(min(0.97, p + boost) for p in probs),
                      now - timedelta(days=days_ago), rng)
    audit(db, user, "demo.seed", "school", school.id, school.id)
    db.commit()
    print("demo school ready (simulated data, clearly labelled)")
    return user


def create_official(db: DB, email: str, name: str, school_ids: list[str]) -> None:
    temp = secrets.token_urlsafe(10) + "9a"
    u = User(email=email.lower(), full_name=name, password_hash=hash_password(temp), role="official")
    db.add(u)
    db.flush()
    for sid in school_ids:
        if not db.get(School, sid):
            raise SystemExit(f"unknown school {sid}")
        db.add(OfficialAccess(user_id=u.id, school_id=sid))
        audit(db, None, "official.grant", "user", u.id, sid, {"via": "cli"})
    db.commit()
    print(f"official created: {email}  temporary password: {temp}")


def apply_retention(db: DB) -> None:
    total = 0
    for school in db.scalars(select(School)):
        cutoff = utcnow() - timedelta(days=school.data_retention_days)
        ids = list(db.scalars(select(Session.id).where(Session.school_id == school.id, Session.started_at < cutoff)))
        if ids:
            db.execute(delete(Session).where(Session.id.in_(ids)))
            audit(db, None, "retention.apply", "school", school.id, school.id, {"deleted_sessions": len(ids)})
            total += len(ids)
    db.commit()
    print(f"deleted {total} expired sessions")


def main() -> None:
    p = argparse.ArgumentParser(prog="app.cli")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("seed")
    d = sub.add_parser("seed-demo")
    d.add_argument("--reset", action="store_true")
    o = sub.add_parser("create-official")
    o.add_argument("--email", required=True)
    o.add_argument("--name", required=True)
    o.add_argument("--school", action="append", required=True)
    sub.add_parser("apply-retention")
    a = p.parse_args()
    db = SessionLocal()
    try:
        if a.cmd == "seed":
            seed(db)
        elif a.cmd == "seed-demo":
            seed_demo(db, reset=a.reset)
        elif a.cmd == "create-official":
            create_official(db, a.email, a.name, a.school)
        elif a.cmd == "apply-retention":
            apply_retention(db)
    finally:
        db.close()


if __name__ == "__main__":
    main()

