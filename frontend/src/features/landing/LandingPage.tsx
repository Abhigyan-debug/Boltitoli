import { motion, useReducedMotion, useScroll, useTransform, type Variants } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  CloudOff,
  FileText,
  Hand,
  Lightbulb,
  type LucideIcon,
  MessagesSquare,
  Mic,
  Minus,
  Mouse,
  PlayCircle,
  Scale,
  ShieldCheck,
  Sparkles,
  Users,
  Volume2,
} from "lucide-react";
import { lazy, type ReactNode, Suspense, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Logo } from "@/components/brand/Logo";
import { HeroIllustration2D } from "@/components/illustrations/HeroIllustration2D";
import { renderTier } from "@/components/three/capability";
import { ThreeBoundary } from "@/components/three/ThreeBoundary";
import { Button } from "@/components/ui/button";
import { Reveal, TiltCard } from "@/components/ui/motion";
import { useAuth } from "@/features/auth/AuthProvider";
import { useMediaQuery } from "@/hooks/useReducedMotion";
import { LanguageToggle } from "@/components/ui/LanguageToggle";
import { useLang, useT } from "@/i18n/I18nProvider";
import { errorMessage } from "@/lib/api";
import { TryAQuestion } from "./TryAQuestion";

const ClassroomHeroScene = lazy(() => import("@/components/three/ClassroomHeroScene"));

/** Each hero line rises 14px and fades in; the parent staggers them. */
const rise: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
};

const HIGHLIGHTS: { icon: LucideIcon; t: string; d: string; tone: string }[] = [
  { icon: Mic, t: "Voice-guided", d: "learning in Hindi", tone: "bg-saffron-100 text-saffron-600" },
  { icon: Users, t: "Curriculum-aligned", d: "maths activities", tone: "bg-sky-100 text-sky-600" },
  { icon: ShieldCheck, t: "Works offline", d: "in schools", tone: "bg-teal-100 text-teal-700" },
];

const STEPS: { t: string; d: string; icon: LucideIcon; tone: string }[] = [
  { t: "You choose a group and a skill", icon: Users, tone: "bg-sky-100 text-sky-600", d: "Pick the group that needs practice, for example “Pragati, addition within 10”. Setup takes under a minute." },
  { t: "BoltiToli asks in Hindi", icon: Volume2, tone: "bg-saffron-100 text-saffron-600", d: "Through the phone or a Bluetooth speaker, with the same question shown as text and counting objects on screen." },
  { t: "The group answers together", icon: MessagesSquare, tone: "bg-teal-100 text-teal-700", d: "The group says the answer, or the group leader or teacher taps it in. Unclear speech is asked again, never guessed." },
  { t: "Hints, then the next step", icon: Lightbulb, tone: "bg-warning-100 text-warning-700", d: "Wrong answers get a hint, then an explanation and an easier question. Steady right answers lead to harder ones." },
  { t: "You get a short summary", icon: FileText, tone: "bg-success-100 text-success-700", d: "After 15 minutes: what was practised, what was tricky, and a suggested next activity. You decide what happens next." },
];

const OFFLINE: [string, boolean, boolean][] = [
  ["Run a downloaded lesson", true, true],
  ["Hindi voice from saved audio or the phone’s voice", true, true],
  ["Enter answers on the number pad", true, true],
  ["Hints, explanations, easier and harder questions", true, true],
  ["Listen to the group’s spoken answer", false, true],
  ["Natural Hindi voice for new text", false, true],
  ["Teacher summary written by AI", false, true],
  ["Rule-based summary", true, true],
];

const PRINCIPLES: { t: string; d: string; icon: LucideIcon; tone: string }[] = [
  { t: "No children’s data", icon: ShieldCheck, tone: "bg-teal-100 text-teal-700", d: "Groups have friendly names, not lists of children. Voice is sent once to be transcribed and never stored." },
  { t: "Rules decide, AI explains", icon: Scale, tone: "bg-sky-100 text-sky-600", d: "Whether an answer is right, and which question comes next, is decided by fixed lesson rules. AI only writes summaries, checked against the session’s numbers." },
  { t: "Suggestions, not judgements", icon: Hand, tone: "bg-saffron-100 text-saffron-600", d: "BoltiToli may suggest reviewing a group’s level. You can repeat, skip, override or end at any time." },
];

/** Little glass badge floating over the hero scene. */
function FloatBadge({ className, delay, children }: { className: string; delay: number; children: ReactNode }) {
  return (
    <motion.div
      aria-hidden
      initial={{ opacity: 0, scale: 0.85, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ delay, type: "spring", stiffness: 200, damping: 18 }}
      className={`absolute z-10 ${className}`}
    >
      <div className="flex animate-[bt-float_4s_ease-in-out_infinite] items-center gap-2.5 rounded-2xl border border-white/70 bg-white/75 px-3.5 py-2.5 shadow-[var(--shadow-lift)] backdrop-blur-md">
        {children}
      </div>
    </motion.div>
  );
}

export default function LandingPage() {
  const [tier] = useState(renderTier);
  const [ready, setReady] = useState(false);
  const { loginDemo, status } = useAuth();
  const nav = useNavigate();
  const [demoBusy, setDemoBusy] = useState(false);
  const reduce = useReducedMotion();
  const t = useT();
  const { lang } = useLang();
  // one scene only: behind the text on wide screens, under it on phones (a hidden canvas would still cost a WebGL context)
  const wide = useMediaQuery("(min-width: 1024px)");
  const hero = useRef<HTMLElement>(null);
  // scroll parallax: as the hero leaves, text drifts up faster than the scene, which eases forward
  const { scrollYProgress } = useScroll({ target: hero, offset: ["start start", "end start"] });
  const textY = useTransform(scrollYProgress, [0, 1], [0, -90]);
  const sceneScale = useTransform(scrollYProgress, [0, 1], [1, 1.08]);
  const sceneY = useTransform(scrollYProgress, [0, 1], [0, 60]);

  const scene = tier === "3d" ? (
    <>
      {!ready && <div className="absolute inset-0"><HeroIllustration2D /></div>}
      <ThreeBoundary fallback={null}>
        <Suspense fallback={null}><ClassroomHeroScene shiftX={wide ? 0.6 : 0} onReady={() => setReady(true)} /></Suspense>
      </ThreeBoundary>
    </>
  ) : <HeroIllustration2D />;

  const demo = async () => {
    setDemoBusy(true);
    try {
      await loginDemo();
      nav("/app");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setDemoBusy(false);
    }
  };

  return (
    <div className="bg-chalk">
      {/* Hero: the 3D classroom fills the right and fades into the cream behind the text */}
      <section ref={hero} className="relative isolate overflow-hidden bg-[#f6ead8]">
        {wide && (
          // the mask fades the canvas itself into the cream, so its left edge never shows as a seam
          <motion.div style={reduce ? undefined : { scale: sceneScale, y: sceneY }}
            className="absolute inset-y-0 right-0 -z-10 w-[64%] origin-center [mask-image:linear-gradient(to_right,transparent,black_38%)]" aria-hidden>
            {scene}
          </motion.div>
        )}
        {wide && (
          <>
            <FloatBadge className="right-[3%] top-[47%]" delay={1.1}>
              <span className="flex h-6 items-end gap-[3px]">
                {[0, 1, 2, 3, 4].map((i) => (
                  <span key={i} className="w-[3px] rounded-full bg-teal-600 animate-[bt-bar_0.9s_ease-in-out_infinite]" style={{ animationDelay: `${i * 0.12}s` }} />
                ))}
              </span>
              <span className="text-[13px] font-semibold text-ink">{t("Listening…")}<span className="block text-[11px] font-medium text-ink-muted">“पाँच!”</span></span>
            </FloatBadge>
            <FloatBadge className="bottom-[9%] right-[24%]" delay={1.5}>
              <span className="grid size-8 place-items-center rounded-full bg-success-100 text-success-700"><BadgeCheck className="size-5" /></span>
              <span className="text-[13px] font-semibold text-ink"><span lang="hi">शाबाश!</span><span className="block text-[11px] font-medium text-ink-muted">3 + 2 = 5</span></span>
            </FloatBadge>
          </>
        )}

        <header className="mx-auto flex max-w-[1240px] items-center gap-6 px-5 py-4">
          <Link to="/"><Logo /></Link>
          <nav aria-label="Page sections" className="hidden flex-1 items-center gap-7 text-[15px] font-medium md:flex">
            <a href="#top" className="hover:text-teal-700">{t("Home")}</a>
            <a href="#how" className="hover:text-teal-700">{t("How it works")}</a>
            <a href="#try" className="hover:text-teal-700">{t("Try a question")}</a>
            <a href="#offline" className="hover:text-teal-700">{t("Offline")}</a>
            <a href="#privacy" className="hover:text-teal-700">{t("Privacy")}</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <LanguageToggle />
            {status === "authenticated" ? <Button asChild variant="slate"><Link to="/app">{t("Open dashboard")} <ArrowRight /></Link></Button> : (
              <>
                <Button asChild variant="secondary" className="hidden bg-white/80 backdrop-blur sm:inline-flex"><Link to="/login">{t("Log in")}</Link></Button>
                <Button asChild variant="slate" className="group/cta"><Link to="/register">{t("Get Started")} <ArrowRight className="transition-transform group-hover/cta:translate-x-0.5" /></Link></Button>
              </>
            )}
          </div>
        </header>

        <motion.div id="top" style={reduce ? undefined : { y: textY }} className="mx-auto max-w-[1240px] px-5 pb-10 pt-8 lg:min-h-[600px] lg:pt-14">
          <motion.div className="max-w-[540px]" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.09 } } }}>
            <motion.p variants={rise} className="inline-flex items-center gap-2 rounded-full border border-saffron-500/25 bg-white/70 px-3 py-1.5 text-[13px] font-semibold text-saffron-700 backdrop-blur">
              <Sparkles className="size-4" aria-hidden /> {t("AI Voice Helper for Classrooms")}
            </motion.p>
            <h1 className="mt-5 text-[44px] font-extrabold leading-[1.05] tracking-[-0.025em] text-slate-800 [&>span]:leading-[1.05] sm:text-[60px]">
              <motion.span variants={rise} className="block">{lang === "hi" ? "हर बच्चा" : "Har Baccha"}</motion.span>
              <motion.span variants={rise} className="block">{lang === "hi" ? "सीख सकता है" : "Seekh Sakta Hai"}</motion.span>
              <motion.span variants={rise} className="block bg-[linear-gradient(110deg,var(--color-saffron-600)_40%,#ffb25e_50%,var(--color-saffron-600)_60%)] bg-[length:250%_100%] bg-clip-text text-transparent animate-[bt-shimmer_6s_linear_infinite]">
                {lang === "hi" ? "अपनी रफ़्तार से" : "Apni Raftaar Se"}
              </motion.span>
            </h1>
            <motion.p variants={rise} className="mt-5 text-[17px] leading-relaxed text-ink-muted">
              {t("BoltiToli is an AI-powered Hindi voice helper that runs guided maths practice for one group of children, so teachers can give full attention to another group.")}
            </motion.p>
            <motion.div variants={rise} className="mt-7 flex flex-wrap gap-3">
              <Button asChild size="lg" variant="slate" className="group/cta"><Link to="/register">{t("Get Started")} <ArrowRight className="transition-transform group-hover/cta:translate-x-1" /></Link></Button>
              <Button size="lg" variant="secondary" onClick={demo} loading={demoBusy}><PlayCircle /> {t("Explore Demo")}</Button>
            </motion.div>
          </motion.div>

          {/* phones and tablets: the scene sits under the text instead of behind it */}
          {!wide && <div className="relative mt-8 aspect-[4/3] overflow-hidden rounded-[var(--radius-slate)] shadow-[var(--shadow-lift)]" aria-hidden>{scene}</div>}
          <p className="sr-only">Illustration: BoltiToli, a small glowing speaker on a classroom desk, asks a group of children “3 + 2 = ?” with number blocks, while the chalkboard shows the same sum with apples.</p>

          <motion.ul initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.08, delayChildren: 0.5 } } }} className="mt-10 grid max-w-[600px] gap-4 sm:grid-cols-3">
            {HIGHLIGHTS.map(({ icon: Icon, t: title, d, tone }) => (
              <motion.li key={title} variants={rise} className="flex items-center gap-3">
                <span className={`tile-3d size-11 shrink-0 ${tone}`}><Icon className="size-5" aria-hidden /></span>
                <span className="text-[13.5px] leading-snug"><strong className="block font-semibold">{t(title)}</strong><span className="text-ink-muted">{t(d)}</span></span>
              </motion.li>
            ))}
          </motion.ul>

          <a href="#try" className="mt-10 hidden w-max flex-col items-center gap-1 text-[12px] text-ink-muted hover:text-ink lg:flex">
            <Mouse className="size-6 animate-[bt-float_2.4s_ease-in-out_infinite]" aria-hidden />
            {t("Scroll to explore")}
          </a>
        </motion.div>
      </section>

      {/* Try a question */}
      <section id="try" className="relative overflow-hidden border-y border-line bg-[linear-gradient(180deg,#ffffff,var(--color-sky-50))]">
        <div aria-hidden className="pointer-events-none absolute -left-24 top-10 size-72 rounded-full bg-teal-100/60 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -right-20 bottom-0 size-80 rounded-full bg-saffron-100/70 blur-3xl" />
        <div className="relative mx-auto grid max-w-[1200px] gap-10 px-5 py-20 lg:grid-cols-[minmax(0,4fr)_minmax(0,6fr)] lg:items-center">
          <Reveal>
            <p className="inline-flex items-center gap-2 rounded-full bg-teal-100 px-3 py-1 text-[13px] font-semibold text-teal-800">
              <span className="relative flex size-2"><span className="absolute inset-0 animate-ping rounded-full bg-teal-600" /><span className="relative size-2 rounded-full bg-teal-600" /></span>
              {t("Live demo")}
            </p>
            <h2 className="mt-4 text-[34px] font-extrabold tracking-[-0.02em] sm:text-[40px]">{t("Try a question")}</h2>
            <p className="mt-3 text-ink-muted">
              {t("This is the real lesson engine with three questions from “Addition within 10”. Answer wrongly once to see the hint, twice to see the explanation and an easier question. On a phone with a Hindi voice installed, it reads aloud.")}
            </p>
            <ul className="mt-6 flex flex-wrap gap-2 text-[13px] font-semibold">
              {["Real lesson engine", "Hint after one wrong answer", "Nothing is recorded"].map((c) => (
                <li key={c} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 shadow-[var(--shadow-card)]">
                  <Check className="size-4 text-success-700" aria-hidden /> {t(c)}
                </li>
              ))}
            </ul>
            <p className="mt-5 text-sm text-ink-muted">{t("In class, the group says the answer out loud and BoltiToli listens.")}</p>
          </Reveal>
          <Reveal delay={0.15} className="relative">
            {/* floating number tiles around the demo card */}
            {[["3", "-left-5 -top-6 bg-saffron-100 text-saffron-700", "0s"], ["+", "-right-4 top-1/3 bg-sky-100 text-sky-600", "0.8s"], ["5", "-bottom-6 left-1/4 bg-success-100 text-success-700", "1.6s"]].map(([n, pos, d]) => (
              <span key={n} aria-hidden style={{ animationDelay: d }}
                className={`tile-3d absolute z-10 hidden size-12 animate-[bt-float_3.6s_ease-in-out_infinite] text-xl font-extrabold sm:grid ${pos}`}>{n}</span>
            ))}
            <TiltCard max={4} glare={false}><TryAQuestion /></TiltCard>
          </Reveal>
        </div>
      </section>

      {/* How */}
      <section id="how" className="mx-auto max-w-[1200px] px-5 py-20">
        <Reveal className="max-w-2xl">
          <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-saffron-700">{t("How it works")}</p>
          <h2 className="mt-2 text-[34px] font-extrabold tracking-[-0.02em] sm:text-[40px]">{t("One 15-minute session, five steps")}</h2>
        </Reveal>
        <div className="relative mt-12">
          {/* the connector draws itself across the steps as they scroll in */}
          <motion.div aria-hidden className="absolute left-[10%] right-[10%] top-[34px] hidden h-[3px] origin-left rounded-full bg-[linear-gradient(90deg,var(--color-sky-600),var(--color-saffron-500),var(--color-success-500))] md:block"
            initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true, margin: "-80px" }} transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }} />
          <ol className="relative grid gap-5 md:grid-cols-5">
            {STEPS.map((s, i) => (
              <motion.li key={s.t} className="h-full" initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.6, delay: 0.12 * i, ease: [0.22, 1, 0.36, 1] }}>
                  <TiltCard className="h-full rounded-[var(--radius-lg)]">
                    <div className="flex h-full flex-col items-center rounded-[var(--radius-lg)] border border-line bg-card px-4 pb-5 pt-4 text-center shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)]">
                      <span className={`tile-3d relative size-[52px] ${s.tone}`}>
                        <s.icon className="size-6" aria-hidden />
                        <span className="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full bg-slate-800 font-chalk text-[13px] text-chalk shadow">{i + 1}</span>
                      </span>
                      <h3 className="mt-4 text-[16px] font-bold leading-snug">{t(s.t)}</h3>
                      <p className="mt-1.5 text-[14px] leading-relaxed text-ink-muted">{t(s.d)}</p>
                    </div>
                  </TiltCard>
              </motion.li>
            ))}
          </ol>
        </div>
      </section>

      {/* Offline */}
      <section id="offline" className="slate-surface relative isolate overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute -left-32 -top-24 -z-10 size-[460px] rounded-full bg-teal-600/30 blur-[90px] animate-[bt-drift_14s_ease-in-out_infinite]" />
        <div aria-hidden className="pointer-events-none absolute -bottom-40 right-0 -z-10 size-[520px] rounded-full bg-sky-600/25 blur-[100px] animate-[bt-drift_18s_ease-in-out_infinite_reverse]" />
        <div className="mx-auto grid max-w-[1200px] gap-12 px-5 py-20 lg:grid-cols-2 lg:items-center">
          <Reveal>
            <span className="tile-3d size-14 bg-white/10 text-[#9fd6c9]"><CloudOff className="size-7" aria-hidden /></span>
            <h2 className="mt-5 text-[34px] font-extrabold tracking-[-0.02em] text-chalk sm:text-[40px]">{t("Made for patchy internet")}</h2>
            <p className="mt-3 text-chalk/80">
              {t("Download a lesson once and it runs without a connection. Sessions recorded offline are saved on the phone and upload automatically when the network returns, without duplicates. Here is exactly what works where.")}
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="rounded-[var(--radius-slate)] border border-white/10 bg-white/[0.06] p-5 shadow-[0_30px_60px_-30px_rgb(0_0_0/0.6)] backdrop-blur-md">
              <table className="w-full text-left text-[15px]">
                <caption className="sr-only">{t("Features available offline and online")}</caption>
                <thead className="text-chalk/75">
                  <tr><th scope="col" className="pb-3 font-semibold">{t("Feature")}</th><th scope="col" className="pb-3 text-center font-semibold">{t("Offline")}</th><th scope="col" className="pb-3 text-center font-semibold">{t("Online")}</th></tr>
                </thead>
                <tbody className="divide-y divide-chalk/10">
                  {OFFLINE.map(([f, off, on], i) => (
                    <motion.tr key={f} initial={{ opacity: 0, x: 16 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: 0.05 * i, duration: 0.4 }}>
                      <td className="py-2.5 pr-3 text-chalk">{t(f)}</td>
                      {[off, on].map((ok, j) => (
                        <td key={j} className="py-2.5 text-center">
                          {ok
                            ? <span className="mx-auto grid size-6 place-items-center rounded-full bg-[#9fd6c9]/20"><Check className="size-4 text-[#9fd6c9]" aria-label={t("Yes")} /></span>
                            : <Minus className="mx-auto size-5 text-chalk/40" aria-label={t("No")} />}
                        </td>
                      ))}
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Privacy */}
      <section id="privacy" className="mx-auto max-w-[1200px] px-5 py-20">
        <Reveal className="max-w-2xl">
          <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-teal-700">{t("Trust")}</p>
          <h2 className="mt-2 text-[34px] font-extrabold tracking-[-0.02em] sm:text-[40px]">{t("The teacher stays in charge")}</h2>
        </Reveal>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {PRINCIPLES.map((p, i) => (
            <Reveal key={p.t} delay={0.12 * i}>
              <TiltCard className="h-full rounded-[var(--radius-lg)]">
                <div className="h-full rounded-[var(--radius-lg)] border border-line bg-card p-6 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)]">
                  <span className={`tile-3d size-12 ${p.tone}`}><p.icon className="size-6" aria-hidden /></span>
                  <h3 className="mt-4 text-lg font-bold">{t(p.t)}</h3>
                  <p className="mt-1.5 text-ink-muted">{t(p.d)}</p>
                </div>
              </TiltCard>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Closing call to action */}
      <section className="px-5 pb-20">
        <Reveal>
          <div className="slate-surface relative isolate mx-auto max-w-[1200px] overflow-hidden rounded-[28px] px-6 py-14 text-center shadow-[var(--shadow-lift)] sm:px-12">
            <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 -z-10 h-64 w-[640px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#3fd4ff]/25 blur-[80px] animate-[bt-drift_12s_ease-in-out_infinite]" />
            <h2 className="text-[30px] font-extrabold tracking-[-0.02em] text-chalk sm:text-[38px]">{t("Give every group its own voice helper")}</h2>
            <p className="mx-auto mt-3 max-w-xl text-chalk/80">{t("Set up a classroom in a few minutes, or look around the demo school first.")}</p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg" className="group/cta"><Link to="/register">{t("Get Started")} <ArrowRight className="transition-transform group-hover/cta:translate-x-1" /></Link></Button>
              <Button size="lg" variant="chalk" onClick={demo} loading={demoBusy}><PlayCircle /> {t("Explore Demo")}</Button>
            </div>
          </div>
        </Reveal>
      </section>

      <footer className="border-t border-line bg-card">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-6 px-5 py-8 text-sm text-ink-muted">
          <Logo sub={false} />
          <nav aria-label="Footer" className="flex flex-wrap gap-5 font-medium">
            <a href="#how" className="hover:text-ink">{t("How it works")}</a>
            <a href="#try" className="hover:text-ink">{t("Try a question")}</a>
            <a href="#offline" className="hover:text-ink">{t("Offline")}</a>
            <a href="#privacy" className="hover:text-ink">{t("Privacy")}</a>
          </nav>
          <p className="w-full sm:w-auto">{t("Built by Team Neural Cyphers. Lessons are drafts until reviewed by a teacher.")}</p>
        </div>
      </footer>
    </div>
  );
}
