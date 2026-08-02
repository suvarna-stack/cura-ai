// ============================================================
// LanguageProvider — component half of the i18n context.
// The dictionary, context object, and useLang hook live in
// LanguageContext.tsx (kept component-free for fast refresh).
// ============================================================
import { useEffect, useState } from "react";
import { LanguageCtx, dict } from "./LanguageContext";
import type { Lang } from "./LanguageContext";

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() =>
    (localStorage.getItem("lang") as Lang) === "th" ? "th" : "en");

  // keep <html lang> honest so screen readers pick the right voice (WCAG 3.1.1)
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = (l: Lang) => {
    localStorage.setItem("lang", l);
    setLangState(l);
  };

  const t = (key: string, vars?: Record<string, string | number>) => {
    let s = dict[key]?.[lang] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
    return s;
  };

  return (
    <LanguageCtx.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageCtx.Provider>
  );
}
