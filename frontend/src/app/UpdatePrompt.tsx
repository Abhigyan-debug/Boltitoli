import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/I18nProvider";

/** Registers the service worker and offers a reload when a new version is ready. */
export function UpdatePrompt() {
  const [update, setUpdate] = useState<null | (() => void)>(null);
  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    let cancelled = false;
    import("virtual:pwa-register")
      .then(({ registerSW }) => {
        const updateSW = registerSW({
          onNeedRefresh: () => !cancelled && setUpdate(() => () => void updateSW(true)),
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const t = useT();
  if (!update) return null;
  return (
    <div role="status" className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-[var(--radius-md)] bg-slate-800 px-4 py-3 text-sm text-chalk shadow-[var(--shadow-lift)]">
      {t("A new version of BoltiToli is ready.")}
      <Button size="sm" variant="chalk" onClick={update}>{t("Reload")}</Button>
    </div>
  );
}
