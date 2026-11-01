import { useQueryClient } from "@tanstack/react-query";
import { Check, Mic, Volume2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Card, Input, Notice, Select } from "@/components/ui/primitives";
import { LanguageToggle } from "@/components/ui/LanguageToggle";
import { useT } from "@/i18n/I18nProvider";
import { useAuth } from "@/features/auth/AuthProvider";
import { ClassroomForm } from "@/features/classrooms/ClassroomsPage";
import { cacheRoster, downloadPack } from "@/features/offline/packs";
import { AnswerRecorder, micSupported } from "@/features/voice/recorder";
import { speak } from "@/features/voice/speaker";
import { api, errorMessage } from "@/lib/api";
import { cn, LEVELS } from "@/lib/utils";
import { useClassrooms, useGroups, useLessons, useSkills, useSpeechStatus } from "@/services/queries";
import type { Group, Level, User } from "@/types/api";

const STEPS = ["Your school", "Classroom", "Groups", "Skills", "Sound check", "Offline lessons"];
const STARTER: { name: string; level: Level }[] = [
  { name: "उड़ान", level: "beginner" },
  { name: "प्रगति", level: "developing" },
  { name: "तरंग", level: "advancing" },
];

export default function OnboardingPage() {
  const { user, setUser, loginDemo } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const rooms = useClassrooms();
  const groups = useGroups();
  const skills = useSkills();
  const lessons = useLessons();
  const speech = useSpeechStatus();
  const [draft, setDraft] = useState(STARTER);
  const [skillFor, setSkillFor] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [checks, setChecks] = useState<{ voice?: string; mic?: string }>({});
  const [downloaded, setDownloaded] = useState<string[]>([]);
  const t = useT();

  const finish = async () => {
    try {
      const u = await api<User>("/auth/me", { method: "PATCH", body: { onboarding_completed: true } });
      setUser({ ...user!, ...u });
    } catch {
      /* the dashboard still works; onboarding will show again next login */
    }
    nav("/app", { replace: true });
  };

  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const room = rooms.data?.[0];

  const createGroups = async () => {
    if (!room) return;
    setBusy(true);
    try {
      for (const g of draft.filter((d) => d.name.trim())) {
        await api<Group>("/groups", { method: "POST", body: { classroom_id: room.id, name: g.name.trim(), level: g.level } });
      }
      await qc.invalidateQueries({ queryKey: ["groups"] });
      next();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const saveSkills = async () => {
    setBusy(true);
    try {
      for (const [gid, sid] of Object.entries(skillFor)) if (sid) await api(`/groups/${gid}`, { method: "PATCH", body: { current_skill_id: sid } });
      await qc.invalidateQueries({ queryKey: ["groups"] });
      next();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const chosenLessons = (lessons.data ?? []).filter((l) => Object.values(skillFor).includes(l.skill.id) ||
    groups.data?.some((g) => g.current_skill_id === l.skill.id));

  return (
    <div className="min-h-dvh bg-chalk">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-5">
        <Logo />
        <div className="flex items-center gap-2">
          <LanguageToggle />
          <Button variant="ghost" onClick={finish}>{t("Skip setup")}</Button>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 pb-16">
        <ol className="mb-8 grid grid-cols-6 gap-1.5" aria-label={t("Setup steps")}>
          {STEPS.map((s, i) => (
            <li key={s} aria-current={i === step ? "step" : undefined}>
              <span className={cn("block h-1.5 rounded-full", i < step ? "bg-teal-600" : i === step ? "bg-saffron-500" : "bg-line")} />
              <span className={cn("mt-1.5 hidden text-[12px] sm:block", i === step ? "font-bold" : "text-ink-muted")}>{i + 1}. {t(s)}</span>
            </li>
          ))}
        </ol>

        {step === 0 && (
          <Card className="p-6">
            <h1 className="text-2xl font-extrabold">{t("Welcome, {name}", { name: user?.full_name.split(" ")[0] })}</h1>
            <p className="mt-2 text-ink-muted">{t("Your account for {school} is ready. Setup takes about five minutes; every step except the classroom can be skipped.", { school: user?.school?.name })}</p>
            <ul className="mt-5 space-y-2 text-sm">
              <li>{t("You create learning groups by level, not lists of children.")}</li>
              <li>{t("BoltiToli runs a 15-minute practice for one group while you teach another.")}</li>
              <li>{t("After each session you get a short summary in Hindi.")}</li>
            </ul>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button onClick={next}>{t("Set up my classroom")}</Button>
              <Button variant="secondary" onClick={async () => { await loginDemo(); nav("/app", { replace: true }); }}>{t("Explore the demo school instead")}</Button>
            </div>
          </Card>
        )}

        {step === 1 && (
          <Card className="p-6">
            <h1 className="text-2xl font-extrabold">{t("Your classroom")}</h1>
            <p className="mb-5 mt-1 text-ink-muted">{t("Most multigrade schools need one, for example “Class 1–3”.")}</p>
            {room ? (
              <>
                <Notice tone="success">{t("Classroom “{name}” is ready.", { name: room.name })}</Notice>
                <Button className="mt-5" onClick={next}>{t("Continue")}</Button>
              </>
            ) : <ClassroomForm onSaved={() => next()} />}
          </Card>
        )}

        {step === 2 && (
          <Card className="p-6">
            <h1 className="text-2xl font-extrabold">{t("Three learning groups")}</h1>
            <p className="mb-5 mt-1 text-ink-muted">{t("Rename them as you like. Levels are a starting point you can change later.")}</p>
            {groups.data && groups.data.length > 0 ? (
              <>
                <Notice tone="success">{t("You already have {n} groups: {names}.", { n: groups.data.length, names: groups.data.map((g) => g.name).join(", ") })}</Notice>
                <Button className="mt-5" onClick={next}>{t("Continue")}</Button>
              </>
            ) : (
              <>
                <div className="space-y-3">
                  {draft.map((d, i) => (
                    <div key={i} className="grid grid-cols-[1fr_auto] gap-3 sm:grid-cols-[1fr_200px]">
                      <Input aria-label={t("Group {n} name", { n: i + 1 })} value={d.name} onChange={(e) => setDraft(draft.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                      <Select aria-label={t("Group {n} level", { n: i + 1 })} value={d.level} onChange={(e) => setDraft(draft.map((x, j) => (j === i ? { ...x, level: e.target.value as Level } : x)))}>
                        {(Object.keys(LEVELS) as Level[]).map((l) => <option key={l} value={l}>{t(LEVELS[l].en)}</option>)}
                      </Select>
                    </div>
                  ))}
                </div>
                <div className="mt-6 flex gap-2">
                  <Button loading={busy} disabled={!room || draft.every((d) => !d.name.trim())} onClick={createGroups}>{t("Create groups")}</Button>
                  <Button variant="ghost" onClick={next}>{t("Skip")}</Button>
                </div>
              </>
            )}
          </Card>
        )}

        {step === 3 && (
          <Card className="p-6">
            <h1 className="text-2xl font-extrabold">{t("First skill for each group")}</h1>
            <p className="mb-5 mt-1 text-ink-muted">{t("Skills follow a progression informed by NIPUN Bharat numeracy goals.")}</p>
            <div className="space-y-3">
              {groups.data?.map((g) => (
                <div key={g.id} className="grid gap-2 sm:grid-cols-[160px_1fr] sm:items-center">
                  <span className="font-semibold">{g.name}</span>
                  <Select aria-label={t("Skill for {name}", { name: g.name })} value={skillFor[g.id] ?? g.current_skill_id ?? ""} onChange={(e) => setSkillFor({ ...skillFor, [g.id]: e.target.value })}>
                    <option value="">{t("Choose later")}</option>
                    {[...(skills.data ?? [])].sort((a, b) => Number(b.level === g.level) - Number(a.level === g.level) || a.sort_order - b.sort_order)
                      .map((s) => <option key={s.id} value={s.id}>{s.name_hi} — {s.name_en}</option>)}
                  </Select>
                </div>
              ))}
            </div>
            <div className="mt-6 flex gap-2">
              <Button loading={busy} onClick={saveSkills}>{t("Save skills")}</Button>
              <Button variant="ghost" onClick={next}>{t("Skip")}</Button>
            </div>
          </Card>
        )}

        {step === 4 && (
          <Card className="p-6">
            <h1 className="text-2xl font-extrabold">{t("Sound check")}</h1>
            <p className="mb-5 mt-1 text-ink-muted">{t("Pair your Bluetooth speaker with this phone first, if you use one.")}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[var(--radius-md)] border border-line p-4">
                <p className="font-semibold">{t("Hindi voice")}</p>
                <p className="text-sm text-ink-muted">{t("Plays one short sentence.")}</p>
                <Button className="mt-3" variant="secondary" onClick={async () => {
                  const h = speak([{ ref: "p:praise_1", text: "शाबाश! बिल्कुल सही।" }]);
                  const src = await h.sourceReady;
                  await h.done;
                  setChecks((c) => ({ ...c, voice: src === "none" ? "No Hindi voice found. Sessions will show text only." : src === "device_voice" ? "Using this phone’s Hindi voice." : "Natural Hindi voice is working." }));
                }}><Volume2 /> {t("Play test")}</Button>
                {checks.voice && <p className="mt-2 text-sm">{t(checks.voice)}</p>}
              </div>
              <div className="rounded-[var(--radius-md)] border border-line p-4">
                <p className="font-semibold">{t("Microphone")}</p>
                <p className="text-sm text-ink-muted">{t(speech.data?.stt_available ? "Say “पाँच” after tapping." : "Listening isn’t configured on the server; answers will be typed.")}</p>
                <Button className="mt-3" variant="secondary" disabled={!micSupported()} onClick={async () => {
                  try {
                    const r = await new AnswerRecorder().start({ maxSeconds: 3 });
                    setChecks((c) => ({ ...c, mic: r.heardSpeech ? "Microphone works." : "The microphone is on but heard nothing. Speak closer." }));
                  } catch (e) {
                    setChecks((c) => ({ ...c, mic: errorMessage(e) }));
                  }
                }}><Mic /> {t("Test microphone")}</Button>
                {checks.mic && <p className="mt-2 text-sm">{t(checks.mic)}</p>}
              </div>
            </div>
            <Button className="mt-6" onClick={next}>{t("Continue")}</Button>
          </Card>
        )}

        {step === 5 && (
          <Card className="p-6">
            <h1 className="text-2xl font-extrabold">{t("Prepare lessons for offline use")}</h1>
            <p className="mb-5 mt-1 text-ink-muted">{t("Downloaded lessons run even when the school has no internet. Answers are typed when offline.")}</p>
            {chosenLessons.length === 0 ? <p className="text-ink-muted">{t("Choose skills for your groups first, or download lessons later from the Lessons page.")}</p> : (
              <ul className="space-y-2">
                {chosenLessons.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-line p-3">
                    <span><span className="font-semibold" lang="hi">{l.title_hi}</span><span className="block text-sm text-ink-muted">{l.title_en}</span></span>
                    {downloaded.includes(l.id) ? <span className="inline-flex items-center gap-1 text-sm text-success-700"><Check className="size-4" /> {t("Saved")}</span> : (
                      <Button size="sm" variant="secondary" loading={busy} onClick={async () => {
                        setBusy(true);
                        try {
                          await downloadPack(l.id, { withAudio: !!speech.data?.tts_available });
                          if (user?.school_id) await cacheRoster(user.school_id);
                          setDownloaded((d) => [...d, l.id]);
                        } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
                      }}>{t("Download")}</Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <Button size="lg" className="mt-6" onClick={finish}>{t("Go to my dashboard")}</Button>
          </Card>
        )}
      </main>
    </div>
  );
}
