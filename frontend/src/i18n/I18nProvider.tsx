"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import en from "./messages/en.json";
import { DEFAULT_LOCALE, detectLocale, isLocale, localeInfo, type Locale } from "./locales";

type Msgs = Record<string, unknown>;

/** Locale messages layered over English, so any key not translated yet shows English instead of breaking. */
function deepMerge(base: Msgs, over: Msgs): Msgs {
  const out: Msgs = { ...base };
  for (const [k, v] of Object.entries(over || {})) {
    out[k] = v && typeof v === "object" && !Array.isArray(v) && typeof base[k] === "object"
      ? deepMerge(base[k] as Msgs, v as Msgs) : v;
  }
  return out;
}

async function loadMessages(l: Locale): Promise<AbstractIntlMessages> {
  if (l === "en") return en as AbstractIntlMessages;
  try {
    const m = await import(`./messages/${l}.json`);
    return deepMerge(en as Msgs, (m.default || m) as Msgs) as AbstractIntlMessages;
  } catch {
    return en as AbstractIntlMessages; // locale file not generated yet
  }
}

type Ctx = { locale: Locale; setLocale: (l: Locale) => void };
const LocaleCtx = createContext<Ctx>({ locale: DEFAULT_LOCALE, setLocale: () => {} });
export const useLocaleSwitch = () => useContext(LocaleCtx);

export function readStoredLocale(): Locale | null {
  try {
    const v = localStorage.getItem("sync_lang");
    return isLocale(v) ? v : null;
  } catch {
    return null;
  }
}

export default function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [messages, setMessages] = useState<AbstractIntlMessages>(en as AbstractIntlMessages);

  const apply = useCallback(async (l: Locale) => {
    setMessages(await loadMessages(l));
    setLocaleState(l);
    document.documentElement.lang = l;
    document.documentElement.dataset.script = localeInfo(l).script;
  }, []);

  useEffect(() => {
    apply(readStoredLocale() ?? detectLocale());
  }, [apply]);

  const setLocale = useCallback((l: Locale) => {
    try { localStorage.setItem("sync_lang", l); } catch {}
    apply(l);
    window.dispatchEvent(new CustomEvent("sync:locale", { detail: l }));
  }, [apply]);

  return (
    <LocaleCtx.Provider value={{ locale, setLocale }}>
      <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Kolkata"
        onError={() => {}} getMessageFallback={({ key }) => key.split(".").pop() || key}>
        {children}
      </NextIntlClientProvider>
    </LocaleCtx.Provider>
  );
}
