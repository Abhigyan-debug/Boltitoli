import * as LabelPrimitive from "@radix-ui/react-label";
import { motion } from "framer-motion";
import { AlertTriangle, Inbox, RefreshCw } from "lucide-react";
import {
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  forwardRef,
  useId,
} from "react";
import { useT } from "@/i18n/I18nProvider";
import { cn, LEVELS } from "@/lib/utils";
import type { Level } from "@/types/api";
import { Button } from "./button";

// ---------------------------------------------------------------- Card -----
export function Card({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("bg-card border border-line rounded-[var(--radius-lg)] shadow-[var(--shadow-card)]", className)} {...p} />
  );
}

export function CardHeader({ title, action, sub }: { title: ReactNode; action?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
      <div>
        <h2 className="text-[17px] font-bold">{title}</h2>
        {sub && <p className="text-sm text-ink-muted mt-0.5">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

// ---------------------------------------------------------------- Forms ----
const inputBase =
  "w-full bg-card border border-line-strong rounded-[var(--radius-md)] px-3 text-[15px] text-ink placeholder:text-ink-faint " +
  "focus:outline-none focus:border-teal-600 focus:ring-3 focus:ring-teal-100 aria-[invalid=true]:border-danger-700 " +
  "aria-[invalid=true]:ring-danger-100 disabled:bg-chalk-dim";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={cn(inputBase, "h-11", className)} {...p} />
));
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...p }, ref) => <textarea ref={ref} className={cn(inputBase, "py-2 min-h-24", className)} {...p} />,
);
Textarea.displayName = "Textarea";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...p }, ref) => (
    <select ref={ref} className={cn(inputBase, "h-11 pr-8 appearance-none bg-no-repeat bg-[right_10px_center]", className)}
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%235c6085' stroke-width='1.8'/%3E%3C/svg%3E\")" }}
      {...p}>
      {children}
    </select>
  ),
);
Select.displayName = "Select";

export function Field({
  label,
  hint,
  error,
  children,
  optional,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  children: (id: string, describedBy: string | undefined) => ReactNode;
}) {
  const id = useId();
  const t = useT();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  return (
    <div className="space-y-1.5">
      <LabelPrimitive.Root htmlFor={id} className="block text-sm font-semibold text-ink">
        {label}
        {optional && <span className="font-normal text-ink-muted"> ({t("optional")})</span>}
      </LabelPrimitive.Root>
      {children(id, [hintId, errId].filter(Boolean).join(" ") || undefined)}
      {hint && !error && (
        <p id={hintId} className="text-[13px] text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} role="alert" className="text-[13px] font-medium text-danger-700">
          {error}
        </p>
      )}
    </div>
  );
}

// ------------------------------------------------------------ Feedback -----
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-[var(--radius-sm)] bg-chalk-dim", className)} />;
}

export function LoadingBlock({ label = "Loading", rows = 3 }: { label?: string; rows?: number }) {
  const t = useT();
  return (
    <div role="status" aria-label={t(label)} className="space-y-3 p-5">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className={cn("h-5", i % 2 ? "w-2/3" : "w-full")} />
      ))}
      <span className="sr-only">{t(label)}…</span>
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
  icon,
}: {
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-10">
      <div className="tile-3d mb-4 size-16 bg-sky-50 text-sky-600 animate-[bt-float_4s_ease-in-out_infinite] [&_svg]:size-8" aria-hidden>
        {icon ?? <Inbox className="size-8" />}
      </div>
      <h3 className="text-base font-bold">{title}</h3>
      {body && <p className="mt-1 max-w-md text-sm text-ink-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const t = useT();
  return (
    <div role="alert" className="flex items-start gap-3 m-4 rounded-[var(--radius-md)] bg-danger-100 p-4 text-danger-700">
      <AlertTriangle className="size-5 mt-0.5 shrink-0" aria-hidden />
      <div className="flex-1 text-sm">
        <p className="font-semibold">{t("Couldn’t load this.")}</p>
        <p>{message}</p>
      </div>
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          <RefreshCw /> {t("Retry")}
        </Button>
      )}
    </div>
  );
}

export function Notice({
  tone = "info",
  children,
  className,
}: {
  tone?: "info" | "warning" | "success" | "danger" | "demo";
  children: ReactNode;
  className?: string;
}) {
  const tones = {
    info: "bg-teal-50 text-teal-800 border-teal-100",
    warning: "bg-warning-100 text-warning-700 border-[#f1dca8]",
    success: "bg-success-100 text-success-700 border-[#c3e3cd]",
    danger: "bg-danger-100 text-danger-700 border-[#efc7bf]",
    demo: "bg-saffron-100 text-[#7a4508] border-[#f3d3a9]",
  };
  return (
    <div className={cn("rounded-[var(--radius-md)] border px-4 py-3 text-sm", tones[tone], className)}>{children}</div>
  );
}

// ------------------------------------------------------------- Tally ------
/** Learning level as counting-stick tally marks: | || ||| */
export function LevelTally({ level, showLabel = true, onSlate = false }: { level: Level; showLabel?: boolean; onSlate?: boolean }) {
  const n = LEVELS[level].tally;
  return (
    <span className="inline-flex items-center gap-2" title={`${LEVELS[level].en} level`}>
      <svg width="22" height="16" viewBox="0 0 22 16" aria-hidden>
        {[0, 1, 2].map((i) => (
          <rect key={i} x={2 + i * 7} y={1} width={3.2} height={14} rx={1.6}
            fill={i < n ? (onSlate ? "var(--color-chalk)" : "var(--color-wood-600)") : onSlate ? "rgb(245 244 239 / .2)" : "var(--color-line)"} />
        ))}
      </svg>
      {showLabel && <span className="text-sm">{LEVELS[level].en}</span>}
    </span>
  );
}

export function PageHeader({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <motion.div className="flex flex-wrap items-end justify-between gap-4 mb-6"
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
      <div>
        <h1 className="text-[26px] sm:text-[32px] font-extrabold tracking-[-0.015em]">{title}</h1>
        {sub && <p className="mt-1 text-ink-muted max-w-2xl">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </motion.div>
  );
}
