"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, Headset, MessageCircle, Phone, RefreshCw, Search, ShieldCheck, Wrench } from "lucide-react";
import { api } from "@/lib/api";
import { inr } from "@/lib/format";
import { telHref, waHref, waited } from "@/lib/contact";
import { ErrorNote, Skeleton, Status, cn } from "@/components/ui";

/* eslint-disable @typescript-eslint/no-explicit-any */
const TABS = [
  { key: "work", label: "My work", hint: "Everything that needs the team, most urgent first", icon: Clock3 },
  { key: "help", label: "Call-backs", hint: "Customers who asked for a person", icon: Headset },
  { key: "kyc", label: "Verification", hint: "Held for a person to check", icon: ShieldCheck },
  { key: "install", label: "Installations", hint: "Book, install, activate", icon: Wrench },
  { key: "waiting", label: "With customer", hint: "Waiting on the customer", icon: MessageCircle },
  { key: "done", label: "Done", hint: "Live or closed", icon: CheckCircle2 },
] as const;
const KIND_TONE: Record<string, string> = { help: "bg-brand", kyc: "bg-info", schedule: "bg-warn", install: "bg-warn", waiting: "bg-line-2" };
const LANG: Record<string, string> = { en: "English", hi: "Hindi", te: "Telugu", ta: "Tamil", kn: "Kannada", ml: "Malayalam", mr: "Marathi", bn: "Bengali", gu: "Gujarati", pa: "Punjabi" };

export default function Work() {
  const [tab, setTab] = useState<string>("work");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<any[] | null>(null);
  const [sum, setSum] = useState<any>(null);
  const [err, setErr] = useState<unknown>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const p = new URLSearchParams({ queue: tab });
    if (q) p.set("q", q);
    Promise.all([api(`/api/employee/applications?${p}`, { as: "employee" }), api("/api/employee/summary", { as: "employee" })])
      .then(([l, s]) => { setRows(l.applications); setSum(s); setErr(null); }).catch(setErr);
  }, [tab, q, tick]);
  useEffect(() => { const id = setInterval(() => setTick((x) => x + 1), 15000); return () => clearInterval(id); }, []); // live

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Good to see you. Here is what needs you.</h1>
          <p className="text-sm text-muted">Clean applications are approved automatically; only real exceptions land here. Refreshes every 15 seconds. Call and WhatsApp buttons are a demo: they open your phone or WhatsApp and are not integrated with a call centre.</p>
        </div>
        <div className="flex gap-3 text-sm">
          <div className="card px-4 py-2"><div className="text-xs text-muted">Actions today</div><div className="text-xl font-extrabold tabular-nums">{sum?.actions_today ?? "–"}</div></div>
          <div className={cn("card px-4 py-2", sum?.at_risk ? "border-bad/30 bg-bad-bg" : "")}><div className="text-xs text-muted">Install at risk (21-day SLA)</div><div className={cn("text-xl font-extrabold tabular-nums", sum?.at_risk && "text-bad")}>{sum?.at_risk ?? "–"}</div></div>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {TABS.map((x) => {
          const n = sum?.queues?.[x.key];
          const Icon = x.icon;
          return (
            <button key={x.key} onClick={() => setTab(x.key)} title={x.hint}
              className={cn("card flex items-center justify-between gap-2 p-3.5 text-left transition", tab === x.key ? "border-ink bg-ink text-white" : "hover:border-ink-2/30")}>
              <span className="flex items-center gap-2 text-sm font-bold"><Icon className="h-4 w-4" />{x.label}</span>
              <span className={cn("text-xl font-extrabold tabular-nums", x.key === "help" && n > 0 && tab !== x.key && "text-brand")}>{n ?? "–"}</span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <label className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-subtle" />
          <input className="input pl-9" placeholder="Search customer, business, city or #id" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <button onClick={() => setTick((x) => x + 1)} className="grid h-11 w-11 place-items-center rounded-full border border-line bg-white hover:bg-surface-2" aria-label="Refresh"><RefreshCw className="h-4 w-4" /></button>
      </div>

      <ErrorNote error={err} />
      <div className="space-y-2.5">
        {!rows && [0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}
        {rows?.map((r) => {
          const tk = r.task;
          const msg = `Hello ${r.customer}, this is Airtel Vyapaar Connect about your order #${r.id}.`;
          return (
            <div key={r.id} className="card relative flex flex-wrap items-center gap-4 overflow-hidden p-4 pl-6">
              <span className={cn("absolute inset-y-0 left-0 w-1.5", KIND_TONE[tk?.kind] || "bg-line")} />
              <div className="min-w-[220px] flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/employee/${r.id}`} className="font-bold text-ink hover:text-brand">#{r.id} · {r.customer}</Link>
                  {r.is_guest && <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold text-muted">GUEST</span>}
                  <Status s={r.status} label={r.status_label} />
                  {r.at_risk && <span className="inline-flex items-center gap-1 rounded-full bg-bad-bg px-2 py-0.5 text-xs font-bold text-bad"><AlertTriangle className="h-3 w-3" />SLA risk</span>}
                </div>
                <div className="mt-0.5 text-sm text-muted">{[r.business_type, r.city, LANG[r.language]].filter(Boolean).join(" · ")}{r.monthly_estimate ? ` · ${inr(r.monthly_estimate)}/mo` : ""}</div>
                {tk && <div className="mt-1.5 text-sm font-semibold text-ink-2">{tk.label}</div>}
              </div>
              {tk && tk.kind !== "waiting" && (
                <div className={cn("text-right text-sm", tk.waiting_min > 60 ? "text-bad" : "text-muted")}>
                  <div className="text-xs">waiting</div><div className="font-bold tabular-nums">{waited(tk.waiting_min)}</div>
                </div>
              )}
              <div className="flex items-center gap-2">
                {r.phone && <a href={telHref(r.phone)} title="Demo: opens your phone dialer (not integrated with a call centre)" className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-2 text-sm font-semibold text-white hover:bg-ink-2"><Phone className="h-4 w-4" />Call</a>}
                {r.phone && <a href={waHref(r.phone, msg)} target="_blank" rel="noreferrer" title="Demo: opens WhatsApp (not integrated)" className="grid h-9 w-9 place-items-center rounded-full bg-[#25D366]/15 text-[#128C4B] hover:bg-[#25D366]/25" aria-label="WhatsApp"><MessageCircle className="h-4 w-4" /></a>}
                <Link href={`/employee/${r.id}`} className="inline-flex items-center gap-1 rounded-full border border-line-2 px-3.5 py-2 text-sm font-semibold hover:bg-surface">Open<ArrowRight className="h-4 w-4" /></Link>
              </div>
            </div>
          );
        })}
        {rows?.length === 0 && (
          <div className="card px-4 py-14 text-center text-muted"><CheckCircle2 className="mx-auto mb-2 h-7 w-7 text-ok" />All clear. Nothing waiting in this queue.</div>
        )}
      </div>
    </div>
  );
}
