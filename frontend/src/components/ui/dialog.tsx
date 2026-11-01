import * as AD from "@radix-ui/react-alert-dialog";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useT } from "@/i18n/I18nProvider";
import { cn } from "@/lib/utils";
import { Button } from "./button";

const overlay =
  "fixed inset-0 z-50 bg-slate-950/45 data-[state=open]:animate-[fade-in_160ms_ease-out]";
const panel =
  "fixed z-50 left-1/2 top-1/2 w-[calc(100vw-24px)] max-w-lg -translate-x-1/2 -translate-y-1/2 bg-card " +
  "rounded-[var(--radius-lg)] border border-line shadow-[var(--shadow-lift)] p-6 max-h-[90vh] overflow-y-auto " +
  "data-[state=open]:animate-[dialog-in_200ms_var(--ease-out)]";

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  const t = useT();
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className={overlay} />
        <D.Content className={cn(panel, wide && "max-w-2xl")}>
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <D.Title className="text-xl font-bold">{title}</D.Title>
              {description ? (
                <D.Description className="text-sm text-ink-muted mt-1">{description}</D.Description>
              ) : (
                <D.Description className="sr-only">{title}</D.Description>
              )}
            </div>
            <D.Close asChild>
              <Button variant="ghost" size="icon" aria-label={t("Close")}>
                <X />
              </Button>
            </D.Close>
          </div>
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  onConfirm,
  danger,
  loading,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  danger?: boolean;
  loading?: boolean;
}) {
  const t = useT();
  return (
    <AD.Root open={open} onOpenChange={onOpenChange}>
      <AD.Portal>
        <AD.Overlay className={overlay} />
        <AD.Content className={panel}>
          <AD.Title className="text-xl font-bold">{title}</AD.Title>
          <AD.Description asChild>
            <div className="mt-2 text-sm text-ink-muted">{body}</div>
          </AD.Description>
          <div className="mt-6 flex justify-end gap-2">
            <AD.Cancel asChild>
              <Button variant="secondary">{t("Cancel")}</Button>
            </AD.Cancel>
            <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={loading}>
              {confirmLabel}
            </Button>
          </div>
        </AD.Content>
      </AD.Portal>
    </AD.Root>
  );
}
