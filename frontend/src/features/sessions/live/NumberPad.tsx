import { Delete, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/I18nProvider";
import { cn } from "@/lib/utils";

/** Large-key number pad for teachers and group leaders. Digits on a keyboard work too. */
export function NumberPad({ onSubmit, disabled, by, onByChange }: {
  onSubmit: (value: number) => void;
  disabled?: boolean;
  by: "manual" | "leader";
  onByChange: (b: "manual" | "leader") => void;
}) {
  const [v, setV] = useState("");
  const t = useT();
  const push = (d: string) => setV((x) => (x.length >= 3 ? x : (x === "0" ? d : x + d)));
  const submit = () => {
    if (!v) return;
    onSubmit(parseInt(v, 10));
    setV("");
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (disabled || (e.target as HTMLElement)?.tagName === "INPUT") return;
      if (/^[0-9]$/.test(e.key)) push(e.key);
      else if (e.key === "Backspace") setV((x) => x.slice(0, -1));
      else if (e.key === "Enter") submit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div role="radiogroup" aria-label={t("Who is entering the answer")} className="inline-flex rounded-[var(--radius-md)] bg-chalk-dim p-1 text-sm">
          {(["manual", "leader"] as const).map((k) => (
            <button key={k} role="radio" aria-checked={by === k} onClick={() => onByChange(k)}
              className={cn("rounded-[var(--radius-sm)] px-3 h-8 font-semibold", by === k ? "bg-card shadow-sm" : "text-ink-muted")}>
              {k === "manual" ? "शिक्षक" : "टोली-लीडर"}
            </button>
          ))}
        </div>
        <output aria-live="polite" aria-label={t("Answer being entered")}
          className="min-w-24 rounded-[var(--radius-md)] border-2 border-slate-800 bg-card px-3 h-12 grid place-items-center text-[28px] font-extrabold tabular">
          {v || <span className="text-ink-faint">—</span>}
        </output>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} disabled={disabled} onClick={() => push(d)}
            className="h-14 rounded-[14px] border border-line bg-[linear-gradient(180deg,#ffffff,#f4efe6)] shadow-[0_3px_0_var(--color-line-strong)] transition-[transform,box-shadow] hover:-translate-y-px active:shadow-none text-[24px] font-bold active:translate-y-px active:bg-chalk-dim disabled:opacity-50">
            {d}
          </button>
        ))}
        <button disabled={disabled} onClick={() => setV((x) => x.slice(0, -1))} aria-label={t("Delete last digit")}
          className="h-14 rounded-[14px] border border-line bg-[linear-gradient(180deg,#ffffff,#f4efe6)] shadow-[0_3px_0_var(--color-line-strong)] transition-[transform,box-shadow] hover:-translate-y-px active:shadow-none grid place-items-center active:translate-y-px disabled:opacity-50">
          <Delete className="size-6" />
        </button>
        <button disabled={disabled} onClick={() => push("0")}
          className="h-14 rounded-[14px] border border-line bg-[linear-gradient(180deg,#ffffff,#f4efe6)] shadow-[0_3px_0_var(--color-line-strong)] transition-[transform,box-shadow] hover:-translate-y-px active:shadow-none text-[24px] font-bold active:translate-y-px disabled:opacity-50">0</button>
        <Button className="h-14 text-lg" disabled={disabled || !v} onClick={submit}><Send /> भेजें</Button>
      </div>
    </div>
  );
}
