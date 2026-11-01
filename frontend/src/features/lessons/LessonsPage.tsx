import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CircleDashed, Download, HardDriveDownload, Play, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { ToyBlocks } from "@/components/illustrations/Cartoons";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/I18nProvider";
import { TiltCard } from "@/components/ui/motion";
import { Card, EmptyState, ErrorState, LevelTally, LoadingBlock, Notice, PageHeader } from "@/components/ui/primitives";
import { useAuth } from "@/features/auth/AuthProvider";
import { deletePack, listPacks } from "@/features/offline/db";
import { cacheRoster, downloadPack } from "@/features/offline/packs";
import { useOnline } from "@/hooks/useOnline";
import { errorMessage } from "@/lib/api";
import { fmtDate, LEVELS } from "@/lib/utils";
import { useLessons, useSpeechStatus } from "@/services/queries";
import type { Lesson, Level } from "@/types/api";

type Saved = Awaited<ReturnType<typeof listPacks>>[number];

/** Digits for the tile's toy blocks, picked from the lesson topic (decorative only). */
function lessonDigits(l: Lesson): string[] {
  const t = `${l.title_en} ${l.skill.name_en}`.toLowerCase();
  if (t.includes("subtract") || t.includes("take away")) return ["5", "−", "2"];
  if (t.includes("add")) return ["3", "+", "2"];
  if (t.includes("compar")) return ["4", ">", "2"];
  if (t.includes("place") || t.includes("tens")) return ["10", "+", "1"];
  if (t.includes("number line") || t.includes("before") || t.includes("after")) return ["4", "5", "6"];
  return ["1", "2", "3"];
}

function ReviewState({ lesson }: { lesson: Lesson }) {
  const v = lesson.published_version;
  const t = useT();
  if (!v) return null;
  return v.status === "reviewed" ? (
    <span className="inline-flex items-center gap-1 text-[13px] text-success-700">
      <CheckCircle2 className="size-4" aria-hidden /> {t("Reviewed by {name}", { name: v.reviewed_by_name ?? t("a teacher") })}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[13px] text-warning-700">
      <CircleDashed className="size-4" aria-hidden /> {t("Draft, teacher review pending")}
    </span>
  );
}

/** Offline lesson list used when the device has no connection. */
function OfflineLessons({ saved }: { saved: Saved[] }) {
  const nav = useNavigate();
  const t = useT();
  if (!saved.length)
    return <Card><EmptyState title={t("No lessons on this device")} body={t("Connect to the internet and download lessons to use them offline.")} /></Card>;
  return (
    <Card>
      <ul className="divide-y divide-line">
        {saved.map((p) => (
          <li key={p.lesson_id} className="flex flex-wrap items-center gap-3 px-5 py-4">
            <div className="flex-1 min-w-48">
              <p className="font-semibold" lang="hi">{p.title_hi}</p>
              <p className="text-sm text-ink-muted">{p.skill.name_en}, {t("version")} {p.version}, {t(p.audio_clips ? "with Hindi audio" : "text only")}</p>
            </div>
            <Button onClick={() => nav(`/session/offline/new?lesson=${p.lesson_id}`)}><Play /> {t("Run offline")}</Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function LessonsPage() {
  const { user, status } = useAuth();
  const nav = useNavigate();
  const online = useOnline();
  const qc = useQueryClient();
  const lessons = useLessons();
  const speech = useSpeechStatus();
  const saved = useQuery({ networkMode: "always", queryKey: ["offline-packs"], queryFn: listPacks });
  const [busy, setBusy] = useState<Record<string, string>>({});
  const savedById = new Map((saved.data ?? []).map((p) => [p.lesson_id, p]));
  const isStaff = user?.role !== "official";
  const t = useT();

  if (status === "offline_cached" || (!online && lessons.isError)) {
    return (
      <>
        <PageHeader title={t("Lessons on this device")} sub={t("You are offline. These lessons can run without internet; answers are entered by tapping.")} />
        {saved.isLoading ? <LoadingBlock /> : <OfflineLessons saved={saved.data ?? []} />}
      </>
    );
  }

  async function download(l: Lesson) {
    if (!user?.school_id) return;
    setBusy((b) => ({ ...b, [l.id]: t("Downloading…") }));
    try {
      const withAudio = !!speech.data?.tts_available;
      const r = await downloadPack(l.id, {
        withAudio,
        onProgress: (d, total) => setBusy((b) => ({ ...b, [l.id]: t("Saving audio {d}/{n}", { d, n: total }) })),
      });
      await cacheRoster(user.school_id);
      toast.success(
        r.audioSaved === r.audioTotal ? t("{name} is ready offline with Hindi audio", { name: l.title_en })
          : withAudio ? t("{name} saved. Audio stopped at {a}/{b}; the text works offline.", { name: l.title_en, a: r.audioSaved, b: r.audioTotal })
          : t("{name} saved for offline use (text only — Hindi voice isn’t configured on the server).", { name: l.title_en }),
      );
    } catch (e) {
      toast.error(`${t("Download failed:")} ${errorMessage(e)}`);
    } finally {
      setBusy(({ [l.id]: _, ...rest }) => rest);
      await qc.invalidateQueries({ queryKey: ["offline-packs"] });
    }
  }

  const byLevel = (lessons.data ?? []).reduce<Record<Level, Lesson[]>>(
    (acc, l) => ((acc[l.skill.level] ??= []).push(l), acc),
    { beginner: [], developing: [], advancing: [] },
  );

  return (
    <>
      <PageHeader title={t("Lesson library")}
        sub={t("Each lesson is a fixed set of questions with hints and answers that a teacher reviews before use. BoltiToli never makes up curriculum during a session.")} />
      {lessons.data?.some((l) => l.published_version?.status === "draft") && (
        <Notice tone="warning" className="mb-5">
          {t("The starter lessons were written by the BoltiToli team and have not been reviewed by a teacher at your school yet. Open a lesson, read the questions, and mark it reviewed when you are happy with the Hindi wording.")}
        </Notice>
      )}
      {lessons.isLoading ? <Card><LoadingBlock /></Card> : lessons.isError ? <ErrorState message={errorMessage(lessons.error)} onRetry={() => lessons.refetch()} />
        : (
          <div className="space-y-8">
            {(Object.keys(byLevel) as Level[]).map((lvl) => byLevel[lvl].length > 0 && (
              <section key={lvl} aria-labelledby={`lvl-${lvl}`}>
                <h2 id={`lvl-${lvl}`} className="mb-4 flex items-center gap-3 text-lg font-bold">
                  <span className="size-3 rounded-full" style={{ background: LEVELS[lvl].color }} aria-hidden />
                  {t(LEVELS[lvl].en)} <span className="font-normal text-ink-muted" lang="hi">{LEVELS[lvl].hi}</span>
                  <LevelTally level={lvl} showLabel={false} />
                </h2>
                <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {byLevel[lvl].map((l, i) => {
                      const s = savedById.get(l.id);
                      const stale = s && s.version_id !== l.published_version?.id;
                      return (
                        <motion.li key={l.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }}
                          transition={{ duration: 0.5, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] }}>
                         <TiltCard className="h-full rounded-[var(--radius-lg)]">
                          <div className="flex h-full flex-col overflow-hidden rounded-[var(--radius-lg)] border border-line bg-card shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)]">
                          <div className={`relative grid h-32 place-items-center ${LEVELS[lvl].tint}`}>
                            <ToyBlocks digits={lessonDigits(l)} className="h-24 w-32 animate-[bt-float_5s_ease-in-out_infinite]" />
                            <span className="absolute right-3 top-3 rounded-full bg-white/85 px-2 py-0.5 text-[11px] font-bold text-ink-muted backdrop-blur">{t("Grades {g}", { g: l.skill.grade_band })}</span>
                          </div>
                          <div className="flex flex-1 flex-col gap-1 p-4">
                            <Link to={`/app/lessons/${l.id}`} className="text-[17px] font-bold hover:underline underline-offset-4" lang="hi">{l.title_hi}</Link>
                            <p className="text-sm text-ink-muted">{l.title_en}, {t("{n} questions", { n: l.published_version?.question_count })}</p>
                            <div className="mt-1 flex flex-1 flex-col gap-1"><ReviewState lesson={l} />
                              {s && (
                                <span className="inline-flex items-center gap-1 text-[13px] text-teal-800">
                                  <HardDriveDownload className="size-4" aria-hidden />
                                  {stale ? t("Older version on this device") : t("On this device since {date}", { date: fmtDate(s.downloaded_at) })}, {t(s.audio_clips ? "with audio" : "text only")}
                                </span>
                              )}
                            </div>
                          {isStaff && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {busy[l.id] ? (
                                <Button size="sm" variant="secondary" loading>{busy[l.id]}</Button>
                              ) : s && !stale ? (
                                <>
                                  <Button size="sm" variant="secondary" onClick={() => nav(`/session/offline/new?lesson=${l.id}`)}>
                                    <Play /> {t("Run offline")}
                                  </Button>
                                  <Button size="sm" variant="ghost" aria-label={t("Remove {name} from this device", { name: l.title_en })}
                                    onClick={async () => {
                                      await deletePack(l.id);
                                      await qc.invalidateQueries({ queryKey: ["offline-packs"] });
                                      toast.success(t("Removed from this device"));
                                    }}><Trash2 /> {t("Remove")}</Button>
                                </>
                              ) : (
                                <Button size="sm" variant="secondary" onClick={() => void download(l)}>
                                  {stale ? <><RefreshCw /> {t("Update offline copy")}</> : <><Download /> {t("Download for offline")}</>}
                                </Button>
                              )}
                            </div>
                          )}
                          </div>
                          </div>
                         </TiltCard>
                        </motion.li>
                      );
                    })}
                </ul>
              </section>
            ))}
          </div>
        )}
    </>
  );
}
