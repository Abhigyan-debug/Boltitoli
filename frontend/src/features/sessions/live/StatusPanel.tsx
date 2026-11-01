import { Mic, MicOff } from "lucide-react";
import { useT } from "@/i18n/I18nProvider";
import { cn } from "@/lib/utils";

export type UiState =
  | "intro" | "preparing" | "speaking" | "waiting" | "listening" | "checking" | "confirm" | "hint" | "paused" | "complete";

const LABEL: Record<UiState, { hi: string; en: string }> = {
  intro: { hi: "तैयार", en: "Ready to start" },
  preparing: { hi: "तैयारी हो रही है…", en: "Preparing" },
  speaking: { hi: "बोलती टोली बोल रही है", en: "Speaking" },
  waiting: { hi: "जवाब का इंतज़ार", en: "Waiting for the answer. Microphone is off" },
  listening: { hi: "सुन रही है…", en: "Listening. Microphone is on" },
  checking: { hi: "जाँच रही है…", en: "Checking the answer" },
  confirm: { hi: "क्या यही जवाब है?", en: "Confirm what was heard" },
  hint: { hi: "संकेत दे रही है", en: "Giving a hint" },
  paused: { hi: "रुका हुआ", en: "Paused" },
  complete: { hi: "सत्र पूरा हुआ", en: "Session complete" },
};

/**
 * Compact status visual. Bars move only from real microphone levels while
 * listening, and only while audio is actually playing when speaking — never
 * implying the microphone is on when it is not.
 */
export function StatusPanel({ state, levels, voiceNote }: { state: UiState; levels: number[]; voiceNote?: string | null }) {
  const t = useT();
  const bars = 21;
  const listening = state === "listening";
  const speaking = state === "speaking" || state === "hint";
  const series = listening ? levels.slice(-bars) : [];
  return (
    <div className="flex items-center gap-4 text-left lg:flex-col lg:gap-4 lg:text-center" aria-live="polite">
      <div className="hidden h-16 items-center gap-[3px] lg:flex" aria-hidden>
        {Array.from({ length: bars }).map((_, i) => {
          const lvl = listening ? series[i - (bars - series.length)] ?? 0 : 0;
          const h = listening ? 6 + lvl * 58 : speaking ? undefined : 6;
          // fade the ends so the waveform looks like a sound envelope
          const edge = 1 - Math.abs(i - (bars - 1) / 2) / bars;
          return (
            <span key={i}
              className={cn("w-[5px] rounded-full transition-[height] duration-100",
                speaking ? "bg-[linear-gradient(180deg,var(--color-saffron-500),#f2b631)] animate-[bt-wave_900ms_ease-in-out_infinite]"
                  : listening ? "bg-[linear-gradient(180deg,#3fd4ff,var(--color-teal-600))]" : "bg-line-strong")}
              style={{ height: h ?? 30, opacity: 0.45 + edge * 0.55, animationDelay: speaking ? `${(i % 7) * 90}ms` : undefined }} />
          );
        })}
      </div>
      <div className="relative grid size-14 shrink-0 place-items-center lg:size-20" aria-hidden>
        {listening && [0, 1, 2].map((i) => (
          <span key={i} className="absolute inset-0 rounded-full bg-teal-600/30 animate-[bt-ring_1.8s_ease-out_infinite]" style={{ animationDelay: `${i * 0.6}s` }} />
        ))}
        <span className={cn("relative grid size-full place-items-center rounded-full transition-colors",
          listening ? "bg-[linear-gradient(160deg,#21a59b,var(--color-teal-700))] text-white shadow-[var(--shadow-glow-teal)]"
            : speaking ? "bg-saffron-100 text-saffron-600" : "bg-chalk-dim text-ink-muted")}>
          {listening ? <Mic className="size-7 lg:size-9" /> : <MicOff className="size-6 lg:size-7" />}
        </span>
      </div>
      <div className="min-w-0">
        <p className="text-lg font-bold" lang="hi">{LABEL[state].hi}</p>
        <p className="text-[13px] text-ink-muted">{t(LABEL[state].en)}</p>
        {voiceNote && <p className="mt-1 text-[12px] text-ink-faint">{voiceNote}</p>}
      </div>
      {listening && (
        <div className="ml-auto flex h-10 items-center gap-[3px] text-teal-600 lg:hidden" aria-hidden>
          {levels.slice(-14).map((l, i) => <span key={i} className="w-[4px] rounded-full bg-current" style={{ height: 4 + l * 34 }} />)}
        </div>
      )}

    </div>
  );
}
