import { cn } from "@/lib/utils";

/**
 * Mark: a toli (group) of three children with one voice arcing over them.
 * Wordmark set in Mukta ExtraBold; "बोलती टोली" sits beneath when there is room.
 */
export function LogoMark({ className, onSlate = false }: { className?: string; onSlate?: boolean }) {
  return (
    <svg viewBox="0 0 40 40" className={cn("size-9", className)} aria-hidden>
      <rect width="40" height="40" rx="10" fill={onSlate ? "var(--color-chalk)" : "var(--color-slate-800)"} />
      <path d="M10 19a10 10 0 0 1 20 0" fill="none" stroke="var(--color-saffron-500)" strokeWidth="3" strokeLinecap="round" />
      <path d="M15 19a5 5 0 0 1 10 0" fill="none" stroke="var(--color-saffron-500)" strokeWidth="3" strokeLinecap="round" />
      {[12, 20, 28].map((cx) => (
        <circle key={cx} cx={cx} cy={28} r={3.4} fill={onSlate ? "var(--color-slate-800)" : "var(--color-chalk)"} />
      ))}
    </svg>
  );
}

export function Logo({ onSlate = false, sub = true, className }: { onSlate?: boolean; sub?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark onSlate={onSlate} />
      <span className="leading-none">
        <span className={cn("block text-[22px] font-extrabold tracking-[-0.02em]", onSlate ? "text-chalk" : "text-ink")}>
          Bolti<span className={onSlate ? "text-saffron-500" : "text-saffron-600"}>Toli</span>
        </span>
        {sub && (
          <span className={cn("block text-[12px] font-medium mt-0.5", onSlate ? "text-chalk/70" : "text-ink-muted")} lang="hi">
            बोलती टोली
          </span>
        )}
      </span>
    </span>
  );
}
