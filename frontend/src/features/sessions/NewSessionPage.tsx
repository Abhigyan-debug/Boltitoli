import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, CircleSlash, Play, Speaker, Volume2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, ErrorState, Field, LevelTally, LoadingBlock, Notice, PageHeader, Select } from "@/components/ui/primitives";
import { listPacks } from "@/features/offline/db";
import { hindiDeviceVoice, speak } from "@/features/voice/speaker";
import { useOnline } from "@/hooks/useOnline";
import { api, ApiError, errorMessage } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";
import { cn } from "@/lib/utils";
import { useGroups, useLessons, useSkills, useSpeechStatus } from "@/services/queries";
import type { SessionOut } from "@/types/api";

function Capability({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  const tr = useT();
  return (
    <li className="flex items-start gap-2 text-sm">
      {ok ? <CheckCircle2 className="mt-0.5 size-4 text-success-700 shrink-0" aria-label={tr("Available")} />
        : <CircleSlash className="mt-0.5 size-4 text-ink-faint shrink-0" aria-label={tr("Not available")} />}
      <span className={ok ? "" : "text-ink-muted"}>{children}</span>
    </li>
  );
}

export default function NewSessionPage() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const online = useOnline();
  const groups = useGroups();
  const skills = useSkills();
  const lessons = useLessons();
  const speech = useSpeechStatus();
  const packs = useQuery({ networkMode: "always", queryKey: ["offline-packs"], queryFn: listPacks });
  const [groupId, setGroupId] = useState(sp.get("group") ?? "");
  const [skillId, setSkillId] = useState("");
  const [minutes, setMinutes] = useState(15);
  const [voiceMode, setVoiceMode] = useState<"auto" | "text_only">("auto");
  const [starting, setStarting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [deviceVoice, setDeviceVoice] = useState(!!hindiDeviceVoice());
  const t = useT();

  useEffect(() => {
    const update = () => setDeviceVoice(!!hindiDeviceVoice());
    window.speechSynthesis?.addEventListener?.("voiceschanged", update);
    return () => window.speechSynthesis?.removeEventListener?.("voiceschanged", update);
  }, []);

  const group = groups.data?.find((g) => g.id === groupId);
  useEffect(() => {
    if (group) setSkillId(group.current_skill_id ?? "");
  }, [group]);
  useEffect(() => {
    if (!groupId && groups.data?.length === 1) setGroupId(groups.data[0].id);
  }, [groups.data, groupId]);

  const lesson = lessons.data?.find((l) => l.skill.id === skillId);
  const saved = packs.data?.find((p) => p.lesson_id === lesson?.id);
  const sortedSkills = useMemo(
    () => [...(skills.data ?? [])].sort((a, b) =>
      Number(b.level === group?.level) - Number(a.level === group?.level) || a.sort_order - b.sort_order),
    [skills.data, group?.level],
  );

  const testAudio = async () => {
    setTesting(true);
    const h = speak([{ ref: "p:praise_1", text: "शाबाश! बिल्कुल सही।" }]);
    const src = await h.sourceReady;
    await h.done;
    setTesting(false);
    if (src === "none") toast.error(t("No Hindi voice is available on this device right now. You can still run the session in text-only mode."));
  };

  const start = async () => {
    if (!groupId || !skillId) return;
    setStarting(true);
    try {
      const s = await api<SessionOut>("/sessions", { method: "POST", body: { group_id: groupId, skill_id: skillId, planned_minutes: minutes, voice_mode: voiceMode } });
      nav(`/session/${s.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.code === "session_in_progress") {
        const sid = (e.details as { session_id: string }).session_id;
        toast.message(t("This group already has an unfinished session. Opening it."));
        nav(`/session/${sid}`);
      } else if (e instanceof ApiError && e.isNetwork && saved) {
        nav(`/session/offline/new?lesson=${saved.lesson_id}&group=${groupId}`);
      } else toast.error(errorMessage(e));
    } finally {
      setStarting(false);
    }
  };

  if (groups.isLoading || skills.isLoading) return <LoadingBlock />;
  if (groups.isError) return <ErrorState message={errorMessage(groups.error)} onRetry={() => groups.refetch()} />;
  if (!groups.data?.length)
    return <EmptyState title={t("Create a learning group first")} body={t("Sessions are run for one group at a time.")}
      action={<Button asChild><Link to="/app/groups">{t("Create a group")}</Link></Button>} />;

  return (
    <>
      <PageHeader title={t("Start a session")} sub={t("Pick the group BoltiToli will guide. You can teach another group while it runs.")} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Card className="p-5">
            <fieldset>
              <legend className="mb-3 text-base font-bold">{t("Which group?")}</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {groups.data.map((g) => (
                  <label key={g.id} className={cn("cursor-pointer rounded-[var(--radius-md)] border p-4 transition-colors",
                    groupId === g.id ? "border-teal-600 bg-teal-50 ring-2 ring-teal-100" : "border-line-strong hover:border-ink-faint")}>
                    <input type="radio" name="group" className="sr-only" checked={groupId === g.id} onChange={() => setGroupId(g.id)} />
                    <span className="block text-lg font-bold">{g.name}</span>
                    <span className="block text-ink-muted"><LevelTally level={g.level} /></span>
                    {g.size && <span className="block text-[13px] text-ink-muted">{t("{n} children", { n: g.size })}</span>}
                  </label>
                ))}
              </div>
            </fieldset>
          </Card>
          <Card className="space-y-4 p-5">
            <Field label={t("Skill")} hint={group ? t("Skills for the {level} level are listed first.", { level: t(group.level) }) : undefined}>
              {(id) => (
                <Select id={id} value={skillId} onChange={(e) => setSkillId(e.target.value)} disabled={!groupId}>
                  <option value="">{t("Choose a skill")}</option>
                  {sortedSkills.map((s) => <option key={s.id} value={s.id}>{s.name_hi} — {s.name_en}</option>)}
                </Select>
              )}
            </Field>
            {lesson?.published_version?.status === "draft" && (
              <Notice tone="warning">{t("This lesson hasn’t been reviewed by a teacher yet.")} <Link className="underline" to={`/app/lessons/${lesson.id}`}>{t("Read the questions before using it.")}</Link></Notice>
            )}
            <fieldset>
              <legend className="mb-1.5 text-sm font-semibold">{t("Duration")}</legend>
              <div className="inline-flex rounded-[var(--radius-md)] bg-chalk-dim p-1">
                {[10, 15, 20].map((m) => (
                  <button key={m} onClick={() => setMinutes(m)} aria-pressed={minutes === m}
                    className={cn("rounded-[var(--radius-sm)] px-4 h-9 text-sm font-semibold", minutes === m ? "bg-card shadow-sm" : "text-ink-muted")}>
                    {t("{n} min", { n: m })}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-1.5 text-sm font-semibold">{t("Sound")}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {([["auto", "Speak aloud", "Through this device or a paired Bluetooth speaker"], ["text_only", "Text only", "You or the group leader read the questions"]] as const).map(([v, label, d]) => (
                  <label key={v} className={cn("cursor-pointer rounded-[var(--radius-md)] border p-3 text-sm", voiceMode === v ? "border-teal-600 bg-teal-50" : "border-line-strong")}>
                    <input type="radio" name="voice" className="sr-only" checked={voiceMode === v} onChange={() => setVoiceMode(v)} />
                    <span className="block font-semibold">{t(label)}</span>
                    <span className="block text-ink-muted">{t(d)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-bold"><Speaker className="size-5" aria-hidden /> {t("Before you start")}</h2>
            <ul className="mt-3 space-y-2">
              <Capability ok={online}>{t(online ? "Connected to the internet" : "Offline: only downloaded lessons can run")}</Capability>
              <Capability ok={!!speech.data?.tts_available || deviceVoice || !!saved?.audio_clips}>
                {t(speech.data?.tts_available ? "Natural Hindi voice (server)" : saved?.audio_clips ? "Hindi voice saved on this device" : deviceVoice ? "This device’s built-in Hindi voice" : "No Hindi voice: questions will be shown as text")}
              </Capability>
              <Capability ok={!!speech.data?.stt_available && online}>
                {t(speech.data?.stt_available && online ? "Listening to the group’s answer (you confirm what was heard)" : "Listening unavailable: answers are typed on the number pad")}
              </Capability>
              <Capability ok={!!saved}>{t(saved ? "Lesson saved on this device" : "Lesson not saved for offline use")}</Capability>
            </ul>
            <Button variant="secondary" className="mt-4 w-full" onClick={testAudio} loading={testing} disabled={voiceMode === "text_only"}>
              <Volume2 /> {t("Test the speaker")}
            </Button>
          </Card>
          <Button size="xl" className="w-full" disabled={!groupId || !skillId || (!online && !saved)} loading={starting}
            onClick={() => (online ? start() : nav(`/session/offline/new?lesson=${saved!.lesson_id}&group=${groupId}`))}>
            <Play /> {online ? t("Prepare {n}-minute session", { n: minutes }) : t("Prepare offline session")}
          </Button>
          <p className="text-[13px] text-ink-muted">{t("Nothing plays until you tap Start on the next screen.")}</p>
        </aside>
      </div>
    </>
  );
}
