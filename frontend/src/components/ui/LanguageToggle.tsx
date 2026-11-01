import { type Lang, useLang } from "@/i18n/I18nProvider";
import { cn } from "@/lib/utils";

/** हिं | EN switch for the teacher interface; the choice is remembered on this device. */
export function LanguageToggle({ onSlate = false, className }: { onSlate?: boolean; className?: string }) {
  const { lang, setLang } = useLang();
  const opts: { v: Lang; label: string; name: string }[] = [
    { v: "hi", label: "हिं", name: "हिन्दी" },
    { v: "en", label: "EN", name: "English" },
  ];
  return (
    <div role="radiogroup" aria-label="भाषा / Language"
      className={cn("inline-flex shrink-0 rounded-full p-0.5 text-[13px] font-bold", onSlate ? "bg-white/10" : "border border-line bg-white/80 backdrop-blur", className)}>
      {opts.map((o) => (
        <button key={o.v} type="button" role="radio" aria-checked={lang === o.v} aria-label={o.name} lang={o.v}
          onClick={() => setLang(o.v)}
          className={cn("h-7 min-w-9 rounded-full px-2.5 transition-colors",
            lang === o.v ? "bg-slate-800 text-chalk shadow-sm" : onSlate ? "text-chalk/80 hover:text-chalk" : "text-ink-muted hover:text-ink")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
