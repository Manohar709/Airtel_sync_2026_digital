"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Headset, RefreshCw, Search } from "lucide-react";
import { api } from "@/lib/api";
import { dateTime, inr } from "@/lib/format";
import { ErrorNote, Skeleton, Status, cn } from "@/components/ui";

/* eslint-disable @typescript-eslint/no-explicit-any */
const QUEUES = [
  { key: "help", label: "Live help requests", hint: "Customers waiting for a call back" },
  { key: "kyc", label: "KYC exceptions", hint: "Action needed, review or could not check" },
  { key: "new", label: "New submissions", hint: "Submitted, not picked up" },
  { key: "active", label: "In progress", hint: "In review, waiting or ready" },
] as const;
const STATUS = ["submitted", "in_review", "awaiting_customer", "ready_for_activation", "closed", "draft"];
const KYC = ["verified", "action_required", "needs_manual_review", "pending", "unable_to_verify"];
const LABEL: Record<string, string> = {
  submitted: "Submitted", in_review: "In review", awaiting_customer: "Awaiting customer", ready_for_activation: "Ready for activation",
  closed: "Closed", draft: "Draft (help only)", verified: "Verified", action_required: "Action required",
  needs_manual_review: "Needs manual review", pending: "Pending", unable_to_verify: "Unable to verify",
  open: "Help requested", in_progress: "Help in progress", resolved: "Help resolved",
};
const LANG: Record<string, string> = { en: "EN", hi: "HI", te: "TE", ta: "TA", kn: "KN", ml: "ML", mr: "MR", bn: "BN", gu: "GU", pa: "PA" };

export default function Dashboard() {
  const router = useRouter();
  const [queue, setQueue] = useState<string | null>("help");
  const [status, setStatus] = useState("");
  const [kyc, setKyc] = useState("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<any[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const p = new URLSearchParams();
    if (queue) p.set("queue", queue);
    if (status) p.set("status", status);
    if (kyc) p.set("kyc_status", kyc);
    if (q) p.set("q", q);
    Promise.all([api(`/api/employee/applications?${p}`, { as: "employee" }), api("/api/employee/summary", { as: "employee" })])
      .then(([l, s]) => { setRows(l.applications); setCounts(s.queues); setErr(null); }).catch(setErr);
  }, [queue, status, kyc, q, tick]);
  useEffect(() => { const id = setInterval(() => setTick((x) => x + 1), 20000); return () => clearInterval(id); }, []); // live refresh

  const title = useMemo(() => QUEUES.find((x) => x.key === queue)?.label || "All applications", [queue]);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {QUEUES.map((x) => (
          <button key={x.key} onClick={() => setQueue(queue === x.key ? null : x.key)}
            className={cn("card flex items-start justify-between p-4 text-left transition", queue === x.key ? "border-ink ring-2 ring-ink" : "hover:border-ink-2/30")}>
            <div><div className="text-sm font-bold">{x.label}</div><div className="text-xs text-muted">{x.hint}</div></div>
            <div className={cn("text-3xl font-extrabold tabular-nums", x.key === "help" && (counts?.help || 0) > 0 && "text-brand")}>{counts ? counts[x.key] : "–"}</div>
          </button>
        ))}
      </div>

      <div className="card flex flex-wrap items-center gap-3 p-3">
        <div className="mr-auto px-2 text-sm font-bold">{title}</div>
        <label className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-subtle" />
          <input className="input h-9 w-64 py-1.5 pl-9 text-sm" placeholder="Customer, business, city, ID" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <select className="input h-9 w-48 py-1.5 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Any status</option>{STATUS.map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}
        </select>
        <select className="input h-9 w-52 py-1.5 text-sm" value={kyc} onChange={(e) => setKyc(e.target.value)}>
          <option value="">Any KYC</option>{KYC.map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}
        </select>
        <button onClick={() => setTick((x) => x + 1)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-surface-2" aria-label="Refresh"><RefreshCw className="h-4 w-4" /></button>
      </div>

      <ErrorNote error={err} />
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
            <tr>{["#", "Customer", "Business", "Status", "KYC", "Help", "Quote (est./mo)", "Updated"].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody>
            {!rows && [0, 1, 2].map((i) => <tr key={i}><td colSpan={8} className="p-3"><Skeleton className="h-8" /></td></tr>)}
            {rows?.map((r) => (
              <tr key={r.id} onClick={() => router.push(`/employee/${r.id}`)} className="cursor-pointer border-b border-line last:border-0 hover:bg-surface">
                <td className="px-4 py-3"><Link href={`/employee/${r.id}`} className="font-bold text-brand" onClick={(e) => e.stopPropagation()}>#{r.id}</Link></td>
                <td className="px-4 py-3"><div className="font-semibold">{r.customer}{r.is_guest && <span className="ml-1.5 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold text-muted">GUEST</span>}</div><div className="text-xs text-muted">{r.phone || r.email}</div></td>
                <td className="px-4 py-3">{r.business_type || "—"}<div className="text-xs text-muted">{r.city} · {LANG[r.language] || "EN"}</div></td>
                <td className="px-4 py-3"><Status s={r.status} label={LABEL[r.status]} /></td>
                <td className="px-4 py-3"><Status s={r.kyc} label={LABEL[r.kyc]} /></td>
                <td className="px-4 py-3">{r.help_requested ? <Status s={r.help_status} label={LABEL[r.help_status]} /> : <span className="text-subtle">—</span>}</td>
                <td className="px-4 py-3 font-semibold tabular-nums">{inr(r.monthly_estimate)}<div className="text-xs font-normal text-muted">{r.items} item(s)</div></td>
                <td className="px-4 py-3 text-xs text-muted">{dateTime(r.updated_at)}</td>
              </tr>
            ))}
            {rows?.length === 0 && <tr><td colSpan={8} className="px-4 py-12 text-center text-muted"><Headset className="mx-auto mb-2 h-6 w-6 text-subtle" />Nothing here right now.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
