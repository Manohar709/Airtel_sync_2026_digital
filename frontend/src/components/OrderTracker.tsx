"use client";
import { useState } from "react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { AlarmClock, Check, CalendarClock, PartyPopper, UserRound, Wrench } from "lucide-react";
import { api } from "@/lib/api";
import { shortDate } from "@/lib/format";
import { Button, ErrorNote, Field, Notice, cn } from "./ui";
import SmsToast from "./SmsToast";
import ProductArt from "./ProductArt";

/* eslint-disable @typescript-eslint/no-explicit-any */
const UPI = ["GPay", "PhonePe", "Paytm", "BHIM"];

/** Time left to complete e-sign + AutoPay (deadline set by the backend: 3 days after verification). */
function DueBadge({ due, days, locale }: { due?: string; days?: number; locale: string }) {
  const t = useTranslations("orders");
  if (!due) return null;
  const ms = new Date(due.endsWith("Z") ? due : due + "Z").getTime() - Date.now();
  const overdue = ms <= 0;
  const d = Math.floor(ms / 864e5), h = Math.floor((ms % 864e5) / 36e5);
  const left = overdue ? t("dueOver") : d > 0 ? t("dueLeftDays", { d, h }) : t("dueLeftHours", { h: Math.max(h, 1) });
  return (
    <div className={cn("flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3",
      overdue ? "border-bad/30 bg-bad-bg text-bad" : d < 1 ? "border-warn/30 bg-warn-bg text-warn" : "border-brand/20 bg-white text-ink")}>
      <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full", overdue ? "bg-bad text-white" : "bg-brand-50 text-brand")}>
        <AlarmClock className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold">{t("dueTitle", { days: days || 3 })}</div>
        <div className="text-xs opacity-80">{t("dueBy", { date: shortDate(due, locale) })}</div>
      </div>
      <span className={cn("rounded-full px-3 py-1 text-sm font-bold tabular-nums", overdue ? "bg-bad text-white" : "bg-ink text-white")}>{left}</span>
    </div>
  );
}

/** Six-step order progress: received → verified → signed → technician → installed → live. */
export function StageBar({ tr, locale }: { tr: any; locale: string }) {
  const t = useTranslations("orders");
  return (
    <ol className="grid grid-cols-6 gap-1">
      {tr.stages.map((s: any, i: number) => (
        <li key={s.key} className="flex flex-col items-center text-center">
          <div className="flex w-full items-center">
            <div className={cn("h-[3px] flex-1 rounded-full", i === 0 ? "bg-transparent" : s.done || s.current ? "bg-brand" : "bg-line-2")} />
            <motion.div initial={false} animate={{ scale: s.current ? 1.08 : 1 }}
              className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 text-xs font-bold",
                s.done ? "border-brand bg-brand text-white" : s.current ? "border-brand bg-white text-brand ring-4 ring-brand/15" : "border-line-2 bg-white text-subtle")}>
              {s.done ? <Check className="h-4 w-4" /> : i + 1}
            </motion.div>
            <div className={cn("h-[3px] flex-1 rounded-full", i === tr.stages.length - 1 ? "bg-transparent" : s.done ? "bg-brand" : "bg-line-2")} />
          </div>
          <div className={cn("mt-2 text-[11px] font-semibold leading-tight sm:text-xs", s.current ? "text-ink" : s.done ? "text-ink-2" : "text-subtle")}>{t(`stage_${s.key}`)}</div>
          {s.at && <div className="mt-0.5 hidden text-[11px] text-muted sm:block">{shortDate(s.at, locale)}</div>}
        </li>
      ))}
    </ol>
  );
}

function SignAndPay({ order, onDone, locale }: { order: any; onDone: () => void; locale: string }) {
  const t = useTranslations("orders");
  const [sent, setSent] = useState<any>(null);
  const [code, setCode] = useState("");
  const [app, setApp] = useState("GPay");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const failed = order.tracking.next_action?.payment_failed;
  async function send() {
    setBusy(true); setErr(null);
    try { setSent(await api(`/api/orders/${order.id}/esign/start`, { method: "POST" })); } catch (e) { setErr(e); } finally { setBusy(false); }
  }
  async function confirm() {
    setBusy(true); setErr(null);
    try { await api(`/api/orders/${order.id}/confirm`, { method: "POST", body: { code, upi_app: app } }); onDone(); }
    catch (e) { setErr(e); onDone(); } finally { setBusy(false); }
  }
  return (
    <div className="space-y-4">
      <div>
        <div className="font-bold">{t("signTitle")}</div>
        <p className="mt-1 text-sm text-muted">{t("signBody")}</p>
      </div>
      <DueBadge due={order.tracking.next_action?.due} days={order.tracking.next_action?.within_days} locale={locale} />
      {failed && <Notice tone="warn">{t("payFailed")}</Notice>}
      <div>
        <div className="mb-2 text-sm font-semibold">{t("upiApp")}</div>
        <div className="grid grid-cols-4 gap-2">
          {UPI.map((u) => (
            <button key={u} onClick={() => setApp(u)} className={cn("rounded-xl border py-2.5 text-sm font-semibold transition",
              app === u ? "border-brand bg-brand-50 text-brand-700 ring-2 ring-brand/15" : "border-line-2 bg-white hover:border-ink-2/30")}>{u}</button>
          ))}
        </div>
      </div>
      {!sent ? <Button loading={busy} onClick={send}>{t("getCode")}</Button> : (
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t("code")}><input className="input w-40 text-center font-mono text-lg tracking-[0.4em]" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus /></Field>
          <Button loading={busy} disabled={code.length !== 6} onClick={confirm}>{t("signPay")}</Button>

        </div>
      )}
      <SmsToast code={sent?.demo_code} to={sent?.to} onUse={setCode} />
      <ErrorNote error={err} />
    </div>
  );
}

/** The current order: progress, the one next action, per-service ETAs and the technician visit. */
export default function OrderTracker({ order, locale, onChange }: { order: any; locale: string; onChange: () => void }) {
  const t = useTranslations("orders");
  const tc = useTranslations();
  const tr = order.tracking;
  const na = tr.next_action;

  return (
    <div className="space-y-6">
      <StageBar tr={tr} locale={locale} />

      {order.status === "live" ? (
        <Notice tone="ok" title={t("liveTitle")}><PartyPopper className="mr-1 inline h-4 w-4" />{t("liveBody")}</Notice>
      ) : na?.code === "sign" ? (
        <div className="rounded-2xl border-2 border-brand/30 bg-brand-50/40 p-5"><div className="mb-3 text-xs font-bold uppercase tracking-wider text-brand-700">{t("nextTitle")}</div><SignAndPay order={order} onDone={onChange} locale={locale} /></div>
      ) : na?.code === "fix" ? (
        <div className="rounded-2xl border-2 border-warn/30 bg-warn-bg p-5">
          <div className="font-bold text-warn">{t("fixTitle")}</div>
          {na.message && <p className="mt-1 text-sm text-ink-2">“{na.message}”</p>}
          <Button className="mt-3" size="sm" href="/verify">{t("fixGo")}</Button>
        </div>
      ) : tr.waiting_on === "team" ? (
        <Notice tone="info">{t("waiting_team")}</Notice>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-line bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-xs font-bold uppercase tracking-wider text-muted">{t("services")}</div>
            {tr.expected_live && order.status !== "live" && <div className="flex items-center gap-1.5 text-xs font-semibold text-ok"><CalendarClock className="h-3.5 w-3.5" />{t("expectedLive", { date: shortDate(tr.expected_live, locale) })}</div>}
          </div>
          <ul className="space-y-2.5 text-sm">
            {tr.services.map((s: any) => (
              <li key={s.product_id} className="flex items-center justify-between gap-3">
                <ProductArt id={s.product_id} size="sm" />
                <span className="flex-1"><span className="font-semibold">{s.name}</span>{s.quantity > 1 && <span className="text-muted"> × {s.quantity}</span>}</span>
                <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold", order.status === "live" ? "bg-ok-bg text-ok" : "bg-surface-2 text-ink-2")}>
                  {order.status === "live" ? tc("status.live") : t("eta", { date: shortDate(s.eta, locale) })}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-line bg-white p-5">
          <div className="mb-3 text-xs font-bold uppercase tracking-wider text-muted">{t("visit")}</div>
          {tr.slot ? (
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-50 text-brand"><UserRound className="h-5 w-5" /></div>
              <div className="text-sm">
                <div className="font-bold">{tr.slot.technician}</div>
                <div className="text-ink-2">{t("visitWhen", { date: shortDate(tr.slot.date, locale), window: tr.slot.window })}</div>
                {tr.slot.rescheduled && <div className="mt-1 text-xs font-semibold text-warn">{t("rescheduled")}</div>}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-sm text-muted"><Wrench className="h-5 w-5" />{tr.waiting_on === "technician" ? t("waiting_technician") : t("visitAfterSign")}</div>
          )}
        </div>
      </div>
    </div>
  );
}
