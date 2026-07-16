import React from "react";

export type HeaderLanguage = "en" | "zh";

export function LanguageToggle({ lang, setLang }: { lang: HeaderLanguage; setLang: (value: HeaderLanguage) => void }) {
  return (
    <div className="flex rounded-lg border bg-white p-1 text-xs">
      <button type="button" className={`rounded-md px-3 py-1 ${lang === "en" ? "bg-slate-900 text-white" : "text-slate-500"}`} onClick={() => setLang("en")}>
        EN
      </button>
      <button type="button" className={`rounded-md px-3 py-1 ${lang === "zh" ? "bg-slate-900 text-white" : "text-slate-500"}`} onClick={() => setLang("zh")}>
        中文
      </button>
    </div>
  );
}
