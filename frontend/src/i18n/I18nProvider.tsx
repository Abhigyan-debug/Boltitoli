import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { HI } from "./hi";

/**
 * Teacher-interface language. The English text is the key: t("Overview") returns "Overview" in English
 * and HI["Overview"] in Hindi, falling back to English when a translation is missing.
 * Child-facing content (questions, hints, voice) is Hindi in both modes and is not passed through t().
 */
export type Lang = "hi" | "en";
type Vars = Record<string, string | number | undefined>;

const KEY = "bt-lang";

function stored(): Lang | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "hi" || v === "en" ? v : null;
  } catch {
    return null; // storage blocked: fall back to the default
  }
}

// Without a provider (unit tests render components directly) everything stays English.
const I18nContext = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: "en", setLang: () => {} });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => stored() ?? "hi");
  useEffect(() => {
    document.documentElement.lang = lang; // screen readers + Hindi line height
  }, [lang]);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(KEY, l);
    } catch {
      /* not remembered, still switched */
    }
  }, []);
  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useLang() {
  return useContext(I18nContext);
}

/** Returns t(english, vars): the text in the current language, with {name}-style placeholders filled. */
export function useT() {
  const { lang } = useContext(I18nContext);
  return useCallback(
    (en: string, vars?: Vars) => {
      const s = lang === "hi" ? HI[en] ?? en : en;
      return vars ? s.replace(/\{(\w+)\}/g, (m: string, k: string) => (vars[k] === undefined ? m : String(vars[k]))) : s;
    },
    [lang],
  );
}
