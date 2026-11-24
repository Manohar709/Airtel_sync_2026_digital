"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "@/lib/api";
import { localeInfo, type Locale } from "@/i18n/locales";
import { Button, Dialog, cn } from "./ui";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Phase = "idle" | "listening" | "recording" | "transcribing";
const MAX_MS = 30000;

/**
 * Voice input. Uses the browser's live dictation (Web Speech API) when available for the language,
 * otherwise records audio and sends it to the backend for transcription. Audio is never stored.
 */
export default function VoiceButton({ lang, onText, onError, onPhase, disabled, size = "md" }: {
  lang: Locale; onText: (text: string, final: boolean) => void; onError: (msg: string | null) => void;
  onPhase?: (p: Phase) => void; disabled?: boolean; size?: "md" | "lg";
}) {
  const t = useTranslations("voice");
  const [phase, setPhase] = useState<Phase>("idle");
  const [consent, setConsent] = useState(false);
  const rec = useRef<any>(null);
  const media = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gotSpeech = useRef(false);

  useEffect(() => () => stopAll(), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { onPhase?.(phase); }, [phase, onPhase]);

  function stopAll() {
    if (timer.current) clearTimeout(timer.current);
    try { rec.current?.abort?.(); } catch {}
    try { if (media.current?.state === "recording") media.current.stop(); } catch {}
  }

  function click() {
    onError(null);
    if (phase === "listening") { rec.current?.stop(); return; }
    if (phase === "recording") { media.current?.stop(); return; }
    if (phase !== "idle") return;
    if (!window.isSecureContext) { onError(t("secure")); return; }
    let ok = false;
    try { ok = localStorage.getItem("sync_mic_ok") === "1"; } catch {}
    if (!ok) { setConsent(true); return; }
    start();
  }

  function start() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SR) startDictation(SR);
    else startRecording();
  }

  function startDictation(SR: any) {
    const r = new SR();
    rec.current = r;
    gotSpeech.current = false;
    r.lang = localeInfo(lang).speech;
    r.interimResults = true;
    r.continuous = false;
    r.maxAlternatives = 1;
    r.onresult = (e: any) => {
      let text = "", final = false;
      for (let i = 0; i < e.results.length; i++) { text += e.results[i][0].transcript; final = final || e.results[i].isFinal; }
      gotSpeech.current = !!text.trim();
      onText(text, final);
    };
    r.onerror = (e: any) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        // Browser speech service blocked: still try plain recording (it asks for the mic itself)
        if (e.error === "service-not-allowed") { setPhase("idle"); startRecording(); return; }
        onError(t("denied"));
      } else if (e.error === "audio-capture") onError(t("noMic"));
      else if (e.error === "no-speech") onError(t("empty"));
      else if (e.error !== "aborted") { setPhase("idle"); startRecording(); return; } // network / language not supported
      setPhase("idle");
    };
    r.onend = () => setPhase((p) => (p === "listening" ? "idle" : p));
    try { r.start(); setPhase("listening"); } catch { startRecording(); }
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { onError(t("unsupported")); return; }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e: any) {
      onError(e?.name === "NotFoundError" ? t("noMic") : t("denied"));
      return;
    }
    const type = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported?.(m));
    const mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    media.current = mr;
    const chunks: BlobPart[] = [];
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    mr.onstop = async () => {
      if (timer.current) clearTimeout(timer.current);
      stream.getTracks().forEach((tr) => tr.stop());
      const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
      if (blob.size < 800) { onError(t("empty")); setPhase("idle"); return; }
      setPhase("transcribing");
      const form = new FormData();
      form.append("audio", blob, "voice." + (blob.type.includes("ogg") ? "ogg" : blob.type.includes("mp4") ? "m4a" : "webm"));
      form.append("lang", lang);
      try {
        const r = await api<{ text: string }>("/api/voice/transcribe", { form });
        onText(r.text, true);
      } catch (e) {
        onError(e instanceof ApiError && e.status === 422 ? t("empty") : t("failed"));
      } finally { setPhase("idle"); }
    };
    mr.start();
    setPhase("recording");
    timer.current = setTimeout(() => mr.state === "recording" && mr.stop(), MAX_MS);
  }

  const active = phase === "listening" || phase === "recording";
  const dim = size === "lg" ? "h-14 w-14" : "h-11 w-11";
  return (
    <>
      <button type="button" onClick={click} disabled={disabled || phase === "transcribing"}
        aria-label={active ? t("stop") : t("start")} aria-pressed={active} title={active ? t("stop") : t("start")}
        className={cn("relative grid shrink-0 place-items-center rounded-full transition-all disabled:opacity-50", dim,
          active ? "bg-brand text-white shadow-[0_0_0_6px_rgb(228_0_0/0.15)]" : "bg-surface-2 text-ink hover:bg-brand-50 hover:text-brand")}>
        {active && <span className="absolute inset-0 animate-ping rounded-full bg-brand/25" aria-hidden />}
        {phase === "transcribing" ? <Loader2 className="h-5 w-5 animate-spin" /> : active ? <Square className="relative h-4 w-4 fill-current" /> : <Mic className="h-5 w-5" />}
      </button>
      <span className="sr-only" aria-live="polite">{active ? t("listening") : phase === "transcribing" ? t("transcribing") : ""}</span>
      <Dialog open={consent} onClose={() => setConsent(false)} title={t("consentTitle")}>
        <p className="text-muted">{t("consentBody")}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConsent(false)}>{t("cancel")}</Button>
          <Button onClick={() => { try { localStorage.setItem("sync_mic_ok", "1"); } catch {} setConsent(false); start(); }}>{t("allow")}</Button>
        </div>
      </Dialog>
    </>
  );
}

/** Animated bars shown while listening. */
export function Waveform({ active }: { active: boolean }) {
  return (
    <span className={cn("inline-flex h-5 items-center gap-[3px]", !active && "opacity-0")} aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className="h-full w-[3px] origin-center rounded-full bg-brand animate-wave" style={{ animationDelay: `${i * 0.12}s` }} />
      ))}
    </span>
  );
}
