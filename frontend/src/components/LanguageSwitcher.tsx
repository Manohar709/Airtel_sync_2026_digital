"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Languages } from "lucide-react";
import { useTranslations } from "next-intl";
import { LOCALES, localeInfo } from "@/i18n/locales";
import { useLocaleSwitch } from "@/i18n/I18nProvider";
import { api, getUser } from "@/lib/api";
import { cn } from "./ui";

export default function LanguageSwitcher({ dark }: { dark?: boolean }) {
  const { locale, setLocale } = useLocaleSwitch();
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  function choose(code: (typeof LOCALES)[number]["code"]) {
    setLocale(code);
    setOpen(false);
    if (getUser("customer")) api("/api/me/language", { method: "PUT", body: { language: code } }).catch(() => {});
  }
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} aria-haspopup="listbox" aria-expanded={open} aria-label={t("language")}
        className={cn("inline-flex h-10 items-center gap-2 rounded-full px-3 text-sm font-semibold transition",
          dark ? "text-white/90 hover:bg-white/10" : "text-ink-2 hover:bg-surface-2")}>
        <Languages className="h-4 w-4" aria-hidden />
        <span>{localeInfo(locale).native}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul role="listbox" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            className="absolute right-0 z-50 mt-2 grid w-64 grid-cols-2 gap-1 rounded-2xl border border-line bg-white p-2 shadow-[var(--shadow-lift)]">
            {LOCALES.map((l) => (
              <li key={l.code}>
                <button role="option" aria-selected={l.code === locale} onClick={() => choose(l.code)}
                  className={cn("flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm hover:bg-surface",
                    l.code === locale && "bg-brand-50 text-brand-700")}>
                  <span><span className="block font-semibold">{l.native}</span><span className="text-xs text-muted">{l.label}</span></span>
                  {l.code === locale && <Check className="h-4 w-4" aria-hidden />}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
