"use client";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { ArrowRight, ArrowUp, Headset, RotateCcw, Volume2, Square } from "lucide-react";
import { api, apiBase } from "@/lib/api";
import { inr } from "@/lib/format";
import { useLocaleSwitch } from "@/i18n/I18nProvider";
import { localeInfo } from "@/i18n/locales";
import { useApi } from "@/components/hooks";
import { useHelp } from "@/components/HelpDialog";
import { Stepper } from "@/components/SiteChrome";
import VoiceButton, { Waveform, type Phase } from "@/components/VoiceButton";
import { Button, ErrorNote, Notice, Skeleton, cn } from "@/components/ui";
import { Mark } from "@/components/Logo";
import BundleCard from "@/components/BundleCard";

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
  const { openHelp } = useHelp();

  // Runs once: a ?start= suggestion pre-fills the box; ?say= (from the home page) is sent as the first message.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    fetch(apiBase + "/health").then((r) => r.json()).then((h) => setLlmOk(h.llm_configured && !h.llm_last_error)).catch(() => {});
    const start = params.get("start");
    if (start) setText(t("startWith", { type: start }));
  }, [params, t]);
  const said = useRef(false);

  const loadRec = useCallback(() => api("/api/recommendations").then(setRec).catch(() => {}), []);
  // refresh the plan after every answer once there is anything to plan from
  useEffect(() => { if (app?.has_plan) loadRec(); }, [app?.has_plan, app?.messages?.length, loadRec]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [app?.messages?.length, busy]);

  const msgs: any[] = app?.messages || [];
  const lastBot = [...msgs].reverse().find((m) => m.role === "assistant");
  const chips = useChips(app?.ready ? null : lastBot?.asked ?? (msgs.length ? null : "business_type"));
  const lastReal = [...msgs].reverse().find((m) => m.role === "assistant" && !m.quick);
  const mode = lastReal ? !lastReal.fallback : llmOk;
  const locked = app && app.status !== "draft" && app.status !== "awaiting_customer";

  // quick-reply and basic-mode turns are shown as the localised next question (never "you chose ...")
  const botText = (m: any) => (m.fallback || m.quick ? (m.asked ? t(`q.${m.asked}`) : t("q.done")) : m.text);

  async function send(message: string, answer?: Chip) {
    const msg = message.trim();
    if ((!msg && !answer) || busy) return;
    setBusy(true); setErr(null); setText(""); setVoiceMsg(null);
    setApp((a: any) => ({ ...a, messages: [...(a?.messages || []), { role: "user", text: msg || answer?.label }] }));
    try {
      const r = await api("/api/advisor/message", { body: { message: answer ? "" : msg, lang: locale, answer: answer && { field: answer.field, value: answer.value, label: answer.label } } });
      setApp(r.application);
      if (r.llm !== null && r.llm !== undefined) setLlmOk(r.llm);
      if (r.application.ready) loadRec();
    } catch (e) { setErr(e); reload(); }
    finally { setBusy(false); input.current?.focus(); }
  }

  useEffect(() => {
    const say = params.get("say");
    if (say && app && !said.current && !app.messages?.length) { said.current = true; send(say); }
  }, [app, params]); // eslint-disable-line react-hooks/exhaustive-deps

  async function startOver() {
    try { setApp(await api("/api/advisor/reset", { method: "POST" })); setRec(null); } catch (e) { setErr(e); }
  }

  if (error && !app) return <div className="container-x py-10"><ErrorNote error={error} onRetry={reload} /></div>;
  const tierRec = rec?.tiers?.[rec?.start_tier || "recommended"];
  const showBundle = !!(app?.has_plan && tierRec && !busy);
  const listening = phase === "listening" || phase === "recording";

  return (
    <div className="container-x py-6">
      <Stepper current="describe" />
      <div className="mx-auto max-w-3xl">
        <section className="card flex h-[max(520px,calc(100dvh-250px))] flex-col overflow-hidden">
          <header className="flex flex-wrap items-center gap-3 bg-night-gradient px-5 py-4 text-white">
            <Mark className="h-10 w-10" />
            <div className="mr-auto">
              <h1 className="font-display font-semibold leading-tight">{t("title")}</h1>
              <p className="flex items-center gap-1.5 text-xs text-white/60">
                <span className={cn("h-1.5 w-1.5 rounded-full", mode === false ? "bg-[#ffd27a]" : "bg-[#7ee2a8]")} />
                {mode === false ? t("basicMode") : t("subtitle")}
              </p>
            </div>
            {msgs.length > 0 && !locked && (
              <button onClick={startOver} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/10 hover:text-white">
                <RotateCcw className="h-3.5 w-3.5" />{t("startOver")}
              </button>
            )}
          </header>

          <div className="flex-1 space-y-4 overflow-y-auto bg-[linear-gradient(180deg,#fbfaf8,#ffffff)] px-4 py-6 sm:px-6" aria-live="polite">
            {!app ? <div className="space-y-3"><Skeleton className="h-16 w-3/4" /><Skeleton className="ml-auto h-12 w-1/2" /></div> : (
              <AnimatePresence initial={false}>
                {[{ role: "assistant", text: t("greeting") }, ...msgs].map((m: any, i: number, all: any[]) => (
                  <div key={i} className="space-y-3">
                  {showBundle && i === all.length - 1 && m.role === "assistant" && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                      <div className="flex items-end gap-2.5">
                        <Mark className="mb-0.5 h-7 w-7 !rounded-full" />
                        <div className="rounded-[22px] rounded-bl-md border border-line bg-white px-4 py-3 text-[15px] leading-relaxed text-ink">
                          {app.ready ? t("planIntroReady") : t("planIntro")}
                        </div>
                      </div>
                      <div className="pl-9"><BundleCard app={app} rec={rec} plan={tierRec} /></div>
                    </motion.div>
                  )}
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cn("flex items-end gap-2.5", m.role === "user" && "justify-end")}>
                    {m.role === "assistant" && <Mark className="mb-0.5 h-7 w-7 !rounded-full" />}
                    <div className={cn("group relative max-w-[82%] whitespace-pre-wrap px-4 py-3 text-[15px] leading-relaxed",
                      m.role === "user" ? "rounded-[22px] rounded-br-md bg-ink text-white" : "rounded-[22px] rounded-bl-md border border-line bg-white text-ink shadow-[0_1px_2px_rgb(0_0_0/0.04)]")}>
                      {m.role === "user" ? m.text : (showBundle && i === all.length - 1 && !app.ready && (m.fallback || m.quick) && m.asked
                        ? `${t("fineTunePrefix")} ${botText(m)}` : botText(m))}
                      {m.role === "assistant" && read.available && (
                        <button onClick={() => read.speak(i, i > 0 ? botText(m) : m.text)} aria-label={read.speaking === i ? t("stop") : t("listen")}
                          className="absolute -right-2 -top-2 hidden h-7 w-7 place-items-center rounded-full border border-line bg-white text-muted shadow-sm hover:text-brand group-hover:grid focus:grid">
                          {read.speaking === i ? <Square className="h-3 w-3 fill-current" /> : <Volume2 className="h-3.5 w-3.5" />}
                        </button>
                      )}
                    </div>
                  </motion.div>
                  </div>
                ))}
                {busy && (
                  <motion.div key="typing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-end gap-2.5">
                    <Mark className="h-7 w-7 !rounded-full" />
                    <div className="flex items-center gap-1.5 rounded-[22px] rounded-bl-md border border-line bg-white px-4 py-4" aria-label={t("thinking")}>
                      {[0, 1, 2].map((d) => <span key={d} className="h-2 w-2 animate-bounce rounded-full bg-brand/60" style={{ animationDelay: `${d * 0.15}s` }} />)}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            )}
            <div ref={end} />
          </div>

          {/* Composer */}
          <div className="border-t border-line bg-white p-3 sm:p-4">
            {!locked && (
              <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                {!busy && chips.map((c) => (
                  <motion.button key={c.label} whileTap={{ scale: 0.96 }} onClick={() => send(c.label, c)}
                    className="shrink-0 rounded-full border border-line-2 bg-white px-3.5 py-1.5 text-sm font-semibold text-ink-2 transition hover:border-brand hover:bg-brand-50 hover:text-brand-700">
                    {c.label}
                  </motion.button>
                ))}
                <button onClick={openHelp} className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line-2 px-3.5 py-1.5 text-sm font-semibold text-ink-2 hover:bg-surface-2">
                  <Headset className="h-4 w-4 text-brand" />{tc("nav.help")}
                </button>
              </div>
            )}
            {(voiceMsg || err) ? <div className="mb-2">{voiceMsg ? <Notice tone="warn">{voiceMsg}</Notice> : <ErrorNote error={err} />}</div> : null}
            {params.get("voice") && !msgs.length && phase === "idle" && <p className="mb-2 text-xs font-semibold text-brand">{tc("voice.start")} →</p>}
            <form className="flex items-end gap-2 rounded-[24px] border border-line-2 bg-surface p-1.5 focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/10"
              onSubmit={(e) => { e.preventDefault(); send(text); }}>
              <VoiceButton lang={locale} disabled={!!locked || busy} onPhase={setPhase} onError={setVoiceMsg}
                onText={(v, final) => { setText(v); if (final) input.current?.focus(); }} />
              <div className="relative flex-1">
                <textarea ref={input} rows={1} value={text} disabled={!!locked} onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } }}
                  placeholder={locked ? t("placeholderLocked") : listening ? tc("voice.listening") : t("placeholder")}
                  className="max-h-36 min-h-11 w-full resize-none bg-transparent px-2 py-2.5 text-[15px] text-ink placeholder:text-subtle focus:outline-none" />
                <span className="pointer-events-none absolute right-2 top-3"><Waveform active={listening} /></span>
              </div>
              <button type="submit" disabled={busy || !!locked || !text.trim()} aria-label={t("send")}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand text-white transition hover:bg-brand-600 disabled:bg-line-2">
                <ArrowUp className="h-5 w-5" />
              </button>
            </form>
            {phase === "transcribing" && <p className="mt-2 text-xs text-muted">{tc("voice.transcribing")}</p>}
          </div>
        </section>
      </div>
    </div>
  );
}

export default function AdvisorPage() {
  return <Suspense><AdvisorInner /></Suspense>;
}
