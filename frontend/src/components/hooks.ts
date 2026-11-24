"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useLocaleSwitch } from "@/i18n/I18nProvider";

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Fetch JSON once (and on demand). Re-fetches on sign-in/out and when other components signal "sync:app". */
export function useApi<T = any>(path: string | null, as: "customer" | "employee" = "customer") {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(!!path);
  const seq = useRef(0);
  const load = useCallback(async () => {
    if (!path) return;
    const n = ++seq.current;
    setLoading(true);
    try {
      const d = await api<T>(path, { as });
      if (n === seq.current) { setData(d); setError(null); }
    } catch (e) {
      if (n === seq.current) setError(e);
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, [path, as]);
  useEffect(() => {
    load();
    const r = () => load();
    window.addEventListener("sync:session", r);
    window.addEventListener("sync:app", r);
    return () => { window.removeEventListener("sync:session", r); window.removeEventListener("sync:app", r); };
  }, [load]);
  return { data, setData, error, loading, reload: load };
}

const descCache: Record<string, { descriptions: Record<string, string>; translated: boolean }> = {};

/** Catalogue descriptions in the current language (translated + cached by the backend). */
export function useDescriptions() {
  const { locale } = useLocaleSwitch();
  const [d, setD] = useState(descCache[locale] || null);
  useEffect(() => {
    if (descCache[locale]) { setD(descCache[locale]); return; }
    let live = true;
    api(`/api/i18n/catalogue?lang=${locale}`).then((r) => { descCache[locale] = r; if (live) setD(r); }).catch(() => {});
    return () => { live = false; };
  }, [locale]);
  return d;
}
