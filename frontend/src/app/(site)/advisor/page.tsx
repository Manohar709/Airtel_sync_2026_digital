"use client";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { ArrowRight, ArrowUp, RotateCcw, Volume2, Square } from "lucide-react";
import { api, apiBase } from "@/lib/api";
import { inr } from "@/lib/format";
import { useLocaleSwitch } from "@/i18n/I18nProvider";
import { localeInfo } from "@/i18n/locales";
import { useApi } from "@/components/hooks";
import { Stepper } from "@/components/SiteChrome";
import VoiceButton, { Waveform, type Phase } from "@/components/VoiceButton";
import { Button, ErrorNote, Notice, Pill, Skeleton, cn } from "@/components/ui";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Chip = { label: string; field: string; value: unknown };

function useChips(asked: string | null | undefined): Chip[] {
  const t = useTranslations("advisor.chips");
  const tn = useTranslations("needs");
  return useMemo(() => {
    switch (asked) {
      case "business_type":
        return [["salon", "Salon"], ["pharmacy", "Pharmacy"], ["restaurant", "Restaurant"], ["clinic", "Clinic"], ["kirana", "Kirana store"], ["office", "Office"]]
          .map(([k, v]) => ({ label: t(k), field: asked, value: v }));
      case "employee_count":
        return [{ label: t("justMe"), field: asked, value: 1 }, ...[3, 5, 10].map((n) => ({ label: t("people", { n }), field: asked, value: n })),
          { label: t("peoplePlus", { n: 25 }), field: asked, value: 25 }];
      case "num_sites":
        return [{ label: t("oneSite"), field: asked, value: 1 }, ...[2, 3, 5].map((n) => ({ label: t("sites", { n }), field: asked, value: n }))];
      case "needs":
        return ["internet", "pos_billing", "cctv", "mobile_lines", "whatsapp", "wifi"].map((n) => ({ label: tn(n), field: asked, value: [n] }));
      case "has_gstin":
        return [{ label: t("yes"), field: asked, value: true }, { label: t("no"), field: asked, value: false }, { label: t("notSure"), field: asked, value: "skip" }];
      case "current_internet":
        return [["none", "None"], ["hotspot", "Mobile hotspot"], ["broadband", "Broadband"], ["fibre", "Fibre"]].map(([k, v]) => ({ label: t(k), field: asked, value: v }));
      case "monthly_budget_inr":
        return [...[2000, 5000, 10000].map((n) => ({ label: t("budget", { amount: inr(n) }), field: asked, value: n })), { label: t("skip"), field: asked, value: "skip" }];
      default:
        return [];
    }
  }, [asked, t, tn]);
}

function useReadAloud() {
  const { locale } = useLocaleSwitch();
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [speaking, setSpeaking] = useState<number | null>(null);
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const pick = () => {
      const want = localeInfo(locale).speech.toLowerCase();
      const vs = window.speechSynthesis.getVoices();
      setVoice(vs.find((v) => v.lang.toLowerCase() === want) || vs.find((v) => v.lang.toLowerCase().startsWith(locale + "-")) || null);
    };
    pick();
    window.speechSynthesis.addEventListener("voiceschanged", pick);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", pick);
  }, [locale]);
  const speak = (i: number, text: string) => {
    window.speechSynthesis.cancel();
    if (speaking === i) { setSpeaking(null); return; }
    const u = new SpeechSynthesisUtterance(text);
    if (voice) { u.voice = voice; u.lang = voice.lang; }
    u.onend = u.onerror = () => setSpeaking(null);
    setSpeaking(i);
    window.speechSynthesis.speak(u);
  };
  return { available: !!voice, speak, speaking };
}

function AdvisorInner() {
  const t = useTranslations("advisor");
  const tc = useTranslations();
  const params = useSearchParams();
  const { locale } = useLocaleSwitch();
  const { data: app, setData: setApp, error, reload } = useApi("/api/application");
  const [rec, setRec] = useState<any>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [voiceMsg, setVoiceMsg] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [llmOk, setLlmOk] = useState<boolean | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const read = useReadAloud();

  useEffect(() => {
    fetch(apiBase + "/health").then((r) => r.json()).then((h) => setLlmOk(h.llm_configured && !h.llm_last_error)).catch(() => {});
    const start = params.get("start");
    if (start) setText(t("startWith", { type: start }));
  }, [params, t]);

  const loadRec = useCallback(() => api("/api/recommendations").then(setRec).catch(() => {}), []);
  useEffect(() => { if (app?.ready) loadRec(); }, [app?.ready, loadRec]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [app?.messages?.length, busy]);

  const msgs: any[] = app?.messages || [];
  const lastBot = [...msgs].reverse().find((m) => m.role === "assistant");
  const chips = useChips(app?.ready ? null : lastBot?.asked ?? (msgs.length ? null : undefined));
  const mode = lastBot ? !lastBot.fallback : llmOk;
  const locked = app && app.status !== "draft" && app.status !== "awaiting_customer";

  const botText = (m: any) => (m.fallback ? (m.asked ? t(`q.${m.asked}`) : t("q.done")) : m.text);

  async function send(message: string, answer?: Chip) {
    const msg = message.trim();
    if ((!msg && !answer) || busy) return;
    setBusy(true); setErr(null); setText(""); setVoiceMsg(null);
    setApp((a: any) => ({ ...a, messages: [...(a?.messages || []), { role: "user", text: msg || answer?.label }] }));
    try {
      const r = await api("/api/advisor/message", { body: { message: msg, lang: locale, answer: answer && { field: answer.field, value: answer.value, label: answer.label } } });
      setApp(r.application);
      setLlmOk(r.llm);
      if (r.application.ready) loadRec();
    } catch (e) { setErr(e); reload(); }
    finally { setBusy(false); input.current?.focus(); }
  }

  async function startOver() {
    try { setApp(await api("/api/advisor/reset", { method: "POST" })); setRec(null); } catch (e) { setErr(e); }
  }

  if (error && !app) return <div className="container-x py-10"><ErrorNote error={error} onRetry={reload} /></div>;
  const r = app?.requirements;
  const tierRec = rec?.tiers?.recommended;

  return (
    <div className="container-x py-8">
      <Stepper current="describe" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Chat */}
        <section className="card flex h-[min(78vh,760px)] flex-col overflow-hidden">
          <header className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-brand text-sm font-extrabold text-white">AI</div>
            <div className="mr-auto">
              <h1 className="font-bold leading-tight">{t("title")}</h1>
              <p className="text-xs text-muted">{t("subtitle")}</p>
            </div>
            {mode != null && (
              <span title={mode ? undefined : t("basicModeHint")}>
                <Pill tone={mode ? "ok" : "warn"}><span className={cn("h-1.5 w-1.5 rounded-full", mode ? "bg-ok" : "bg-warn")} />{mode ? t("aiMode") : t("basicMode")}</Pill>
              </span>
            )}
            {msgs.length > 0 && !locked && (
              <button onClick={startOver} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-muted hover:bg-surface-2">
                <RotateCcw className="h-3.5 w-3.5" />{t("startOver")}
              </button>
            )}
          </header>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6" aria-live="polite">
            {!app ? <div className="space-y-3"><Skeleton className="h-16 w-3/4" /><Skeleton className="ml-auto h-12 w-1/2" /></div> : (
              <AnimatePresence initial={false}>
                {[{ role: "assistant", text: t("greeting") }, ...msgs].map((m: any, i: number) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cn("flex gap-2", m.role === "user" && "justify-end")}>
                    <div className={cn("group relative max-w-[86%] whitespace-pre-wrap rounded-3xl px-4 py-3 text-[15px] leading-relaxed",
                      m.role === "user" ? "rounded-br-lg bg-ink text-white" : "rounded-bl-lg bg-surface text-ink")}>
                      {m.role === "user" ? m.text : botText(m)}
                      {m.role === "assistant" && read.available && (
                        <button onClick={() => read.speak(i, m.role === "assistant" && i > 0 ? botText(m) : m.text)} aria-label={read.speaking === i ? t("stop") : t("listen")}
                          className="absolute -right-2 -top-2 hidden h-7 w-7 place-items-center rounded-full border border-line bg-white text-muted shadow-sm hover:text-brand group-hover:grid focus:grid">
                          {read.speaking === i ? <Square className="h-3 w-3 fill-current" /> : <Volume2 className="h-3.5 w-3.5" />}
                        </button>
                      )}
                    </div>
                  </motion.div>
                ))}
                {busy && (
                  <motion.div key="typing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex">
                    <div className="flex items-center gap-1.5 rounded-3xl rounded-bl-lg bg-surface px-4 py-4" aria-label={t("thinking")}>
                      {[0, 1, 2].map((d) => <span key={d} className="h-2 w-2 animate-bounce rounded-full bg-subtle" style={{ animationDelay: `${d * 0.15}s` }} />)}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            )}
            {app?.ready && (
              <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}
                className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-brand/30 bg-brand-50 p-4">
                <div><div className="font-bold text-brand-900">{t("readyTitle")}</div><div className="text-sm text-brand-900/70">{t("readyBody")}</div></div>
                <Button href="/plans">{t("seePlans")}<ArrowRight className="h-4 w-4" /></Button>
              </motion.div>
            )}
            <div ref={end} />
          </div>

          {/* Composer */}
          <div className="border-t border-line bg-white p-3 sm:p-4">
            {chips.length > 0 && !busy && !locked && (
              <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                {chips.map((c) => (
                  <motion.button key={c.label} whileTap={{ scale: 0.96 }} onClick={() => send(c.label, c)}
                    className="shrink-0 rounded-full border border-line-2 bg-white px-3.5 py-1.5 text-sm font-semibold text-ink-2 transition hover:border-brand hover:bg-brand-50 hover:text-brand-700">
                    {c.label}
                  </motion.button>
                ))}
              </div>
            )}
            {(voiceMsg || err) ? <div className="mb-2">{voiceMsg ? <Notice tone="warn">{voiceMsg}</Notice> : <ErrorNote error={err} />}</div> : null}
            {params.get("voice") && !msgs.length && phase === "idle" && <p className="mb-2 text-xs font-semibold text-brand">{tc("voice.start")} →</p>}
            <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); send(text); }}>
              <VoiceButton lang={locale} disabled={!!locked || busy} onPhase={setPhase} onError={setVoiceMsg}
                onText={(v, final) => { setText(v); if (final) input.current?.focus(); }} />
              <div className="relative flex-1">
                <textarea ref={input} rows={1} value={text} disabled={!!locked} onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } }}
                  placeholder={locked ? t("placeholderLocked") : phase === "listening" || phase === "recording" ? tc("voice.listening") : t("placeholder")}
                  className="input max-h-36 min-h-11 resize-none py-2.5 pr-12" />
                <span className="pointer-events-none absolute right-3 top-3"><Waveform active={phase === "listening" || phase === "recording"} /></span>
              </div>
              <button type="submit" disabled={busy || !!locked || !text.trim()} aria-label={t("send")}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand text-white transition hover:bg-brand-600 disabled:bg-line-2">
                <ArrowUp className="h-5 w-5" />
              </button>
            </form>
            {phase === "transcribing" && <p className="mt-2 text-xs text-muted">{tc("voice.transcribing")}</p>}
          </div>
        </section>

        {/* Understanding panel */}
        <aside className="space-y-4">
          <div className="card p-5">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-ink-2">{t("understood")}</h2>
            {!r ? <Skeleton className="h-40" /> : (
              <dl className="divide-y divide-line text-sm">
                {(["business_type", "employee_count", "num_sites", "city", "needs", "has_gstin", "current_internet", "monthly_budget_inr"] as const).map((k) => {
                  const v = k === "needs" ? (r.needs.length ? r.needs.map((n: string) => tc(`needs.${n}`)).join(", ") : null)
                    : k === "has_gstin" ? (r.has_gstin == null ? null : r.has_gstin ? t("yes") : t("no"))
                    : k === "monthly_budget_inr" ? (r.monthly_budget_inr != null ? inr(r.monthly_budget_inr) : null) : r[k];
                  const skipped = r.skipped?.includes(k);
                  return (
                    <div key={k} className="flex items-start justify-between gap-3 py-2">
                      <dt className="text-muted">{t(`fields.${k}`)}</dt>
                      <dd className={cn("text-right font-semibold", !v && "font-normal text-subtle")}>
                        <AnimatePresence mode="wait"><motion.span key={String(v ?? skipped)} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
                          {v ?? (skipped ? t("skipped") : t("notGiven"))}
                        </motion.span></AnimatePresence>
                      </dd>
                    </div>
                  );
                })}
              </dl>
            )}
            {r?.city && r.city_tier == null && <p className="mt-3 text-xs text-muted">{t("tierUnknown")}</p>}
          </div>
          {tierRec && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card overflow-hidden">
              <div className="bg-ink px-5 py-4 text-white">
                <div className="text-xs font-semibold uppercase tracking-widest text-white/60">{tc("plans.recommended")}</div>
                <div className="mt-1 text-2xl font-extrabold tabular-nums">{inr(tierRec.quote.monthly.mid)}<span className="text-sm font-semibold text-white/60">{tc("common.perMonth")}</span></div>
                <div className="text-xs text-white/60">{tc("common.estimate")} · {tc("common.exclTax")}</div>
              </div>
              <ul className="space-y-1.5 px-5 py-4 text-sm">
                {tierRec.cart.map((c: any) => <li key={c.product_id} className="flex justify-between gap-2"><span className="font-semibold">{rec.names[c.product_id]}</span><span className="text-muted">× {c.quantity}</span></li>)}
              </ul>
              <div className="px-5 pb-5"><Button className="w-full" href="/plans">{t("seePlans")}</Button></div>
            </motion.div>
          )}
        </aside>
      </div>
    </div>
  );
}

export default function AdvisorPage() {
  return <Suspense><AdvisorInner /></Suspense>;
}
