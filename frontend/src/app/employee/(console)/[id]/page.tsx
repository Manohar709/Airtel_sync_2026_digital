"use client";
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarCheck, CheckCircle2, FileText, Languages, MessageCircle, Phone, ShieldCheck, Undo2, UserRound, Zap } from "lucide-react";
import { api, documentUrl } from "@/lib/api";
import { telHref, waHref, waited } from "@/lib/contact";
import { dateTime, inr, inrRange } from "@/lib/format";
import KycResult from "@/components/KycResult";
import { StageBar } from "@/components/OrderTracker";
import { Button, ErrorNote, Notice, Skeleton, Status } from "@/components/ui";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** The one thing the team does next on this order. */
function NextAction({ d, post, setD }: { d: any; post: (p: string, b?: unknown) => Promise<any>; setD: (v: any) => void }) {
  const [date, setDate] = useState(() => new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10));
  const [win, setWin] = useState(d.slot_windows?.[1] || "");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const go = (key: string, body: any) => async () => {
    setBusy(key); setErr(null);
    try { setD(await post("/status", body)); } catch (e) { setErr(e); } finally { setBusy(null); }
  };
  const held = (d.kyc.checks || []).filter((c: any) => ["needs_manual_review", "unable_to_verify", "action_required"].includes(c.status));
  // message the customer sees, built from the held checks (nothing to type)
  const returnNote = "Please check and re-upload: " + (held.map((c: any) => c.label.toLowerCase()).join(", ") || "your documents") + ".";
  const slot = d.tracking?.slot;

  let body: React.ReactNode = <p className="text-sm text-muted">Nothing to do for the team right now.</p>;
  if (d.status === "submitted" || d.status === "in_review") {
    body = (
      <div className="space-y-3">
        <p className="text-sm text-muted">Review the items checked by the team, then decide.</p>
        <Button className="w-full" loading={busy === "ap"} onClick={go("ap", { status: "approved", note: "Verification approved after review" })}>
          <ShieldCheck className="h-4 w-4" />Approve
        </Button>
        <Button className="w-full" variant="secondary" loading={busy === "rt"} onClick={go("rt", { status: "awaiting_customer", note: returnNote })}>
          <Undo2 className="h-4 w-4" />Return to customer to fix
        </Button>
        <button className="w-full text-center text-xs font-semibold text-muted underline" onClick={go("cl", { status: "closed", note: "Closed by team" })}>Close application</button>
      </div>
    );
  } else if (d.status === "confirmed" || (d.status === "scheduled" && slot)) {
    body = (
      <div className="space-y-3">
        {slot && <div className="flex items-center gap-3 rounded-xl bg-surface p-3 text-sm"><UserRound className="h-5 w-5 text-brand" /><div><b>{slot.technician}</b><div className="text-muted">{slot.date} · {slot.window}</div></div></div>}
        <div className="grid grid-cols-2 gap-2">
          <input type="date" className="input h-10 text-sm" value={date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} />
          <select className="input h-10 text-sm" value={win} onChange={(e) => setWin(e.target.value)}>{d.slot_windows.map((w: string) => <option key={w}>{w}</option>)}</select>
        </div>
        <Button className="w-full" variant={slot ? "secondary" : "primary"} loading={busy === "sc"} onClick={go("sc", { status: "scheduled", date, window: win, note: `Technician visit ${date} ${win}` })}>
          <CalendarCheck className="h-4 w-4" />{slot ? "Reschedule visit" : "Book technician"}
        </Button>
        {d.status === "scheduled" && <Button className="w-full" loading={busy === "in"} onClick={go("in", { status: "installed", note: "Installation completed" })}><CheckCircle2 className="h-4 w-4" />Mark installed</Button>}
      </div>
    );
  } else if (d.status === "installed") {
    body = <Button className="w-full" loading={busy === "lv"} onClick={go("lv", { status: "live", note: "Service activated" })}><Zap className="h-4 w-4" />Activate service (live)</Button>;
  } else if (d.status === "approved") {
    body = <p className="text-sm">Waiting for the customer to e-sign and set up AutoPay in My orders.</p>;
  } else if (d.status === "awaiting_customer") {
    body = <p className="text-sm">Returned to the customer: “{d.tracking?.next_action?.message}”</p>;
  }
  return (
    <section className="card border-2 border-ink/80 p-5">
      <div className="mb-3 flex items-center justify-between"><h2 className="font-bold">Next action</h2>{d.task && <span className="text-xs text-muted">waiting {waited(d.task.waiting_min)}</span>}</div>
      {body}
      <ErrorNote error={err} />
    </section>
  );
}

export default function Detail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [english, setEnglish] = useState<string[] | null>(null);

  const load = useCallback(() => api(`/api/employee/applications/${id}`, { as: "employee" }).then(setD).catch(setErr), [id]);
  useEffect(() => { load(); }, [load]);

  async function act(key: string, fn: () => Promise<any>) {
    setBusy(key); setErr(null);
    try { await fn(); } catch (e) { setErr(e); } finally { setBusy(null); }
  }
  const post = (path: string, body?: unknown) => api(`/api/employee/applications/${id}${path}`, { as: "employee", body: body ?? {}, method: "POST" });

  if (!d) return err ? <ErrorNote error={err} /> : <Skeleton className="h-96" />;
  const r = d.requirements || {};
  const q = d.quote;
  const nonEnglish = d.language && d.language !== "en";

  return (
    <div className="space-y-5">
      <Link href="/employee" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" />My work</Link>

      <div className="card flex flex-wrap items-center gap-4 p-5">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-lg font-extrabold text-brand">{(d.customer || "?").slice(0, 1).toUpperCase()}</div>
        <div className="min-w-[200px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-extrabold">#{d.id} · {d.customer}</h1>
            {d.is_guest && <span className="rounded bg-surface-2 px-2 py-0.5 text-xs font-bold text-muted">GUEST</span>}
            <Status s={d.status} label={d.status_label} />
            {d.at_risk && <span className="rounded-full bg-bad-bg px-2 py-0.5 text-xs font-bold text-bad">SLA risk</span>}
          </div>
          <div className="text-sm text-muted">{[r.business_type, r.city, d.phone, d.email].filter(Boolean).join(" · ")}</div>
          {d.task && <div className="mt-1 text-sm font-semibold">{d.task.label}</div>}
        </div>
        {d.phone && (
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2">
              <a href={telHref(d.phone)} className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-white hover:bg-ink-2"><Phone className="h-4 w-4" />Call</a>
              <a href={waHref(d.phone, `Hello ${d.customer}, this is Airtel Vyapaar Connect about your order #${d.id}.`)} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-[#25D366]/15 px-4 py-2.5 text-sm font-semibold text-[#128C4B]"><MessageCircle className="h-4 w-4" />WhatsApp</a>
            </div>
            <span className="text-[11px] text-subtle">Demo: opens your phone or WhatsApp; not integrated with a call centre</span>
          </div>
        )}
      </div>
      <ErrorNote error={err} />

      {d.help_requested && d.help_status !== "resolved" && (
        <div className="card flex flex-wrap items-center justify-between gap-4 border-l-4 border-l-brand p-5">
          <div>
            <div className="flex items-center gap-2 font-bold">Customer asked for a person · <Status s={d.help_status} /></div>
            <p className="mt-1 text-sm">{d.help_note || "No note left."}</p>
            <p className="mt-1 text-xs text-muted">Requested {dateTime(d.help_at)}</p>
          </div>
          <div className="flex gap-2">
            {d.help_status === "open" && <Button size="sm" variant="dark" loading={busy === "hp"} onClick={() => act("hp", async () => setD(await post("/help", { status: "in_progress" })))}>Take it</Button>}
            <Button size="sm" variant="secondary" loading={busy === "hr"} onClick={() => act("hr", async () => setD(await post("/help", { status: "resolved" })))}>Mark resolved</Button>
          </div>
        </div>
      )}

      {d.tracking && <div className="card p-5"><StageBar tr={d.tracking} locale="en" /></div>}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          <section className="card p-5">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <h2 className="font-bold">Verification</h2>
              <span className="text-xs text-muted">GSTIN {d.kyc.gstin_masked || "-"} · Udyam {d.kyc.udyam_masked || "-"} · mobile {d.kyc.phone_verified ? "confirmed" : "not confirmed"}{d.kyc.digilocker ? " · DigiLocker" : ""}</span>
            </div>
            <KycResult k={d.kyc} staff />
            {d.kyc.registry?.gstin && <p className="mt-3 rounded-xl bg-surface p-3 text-xs text-muted"><b>Registry:</b> {d.kyc.registry.gstin.legal_name} · {d.kyc.registry.gstin.constitution} · {d.kyc.registry.gstin.address} · {d.kyc.registry.gstin.status}</p>}
            {d.kyc.documents?.length > 0 && (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {d.kyc.documents.map((x: any) => (
                  <button key={x.id} onClick={() => act(`doc${x.id}`, async () => window.open(await documentUrl(x.id, "employee"), "_blank"))}
                    className="flex items-start gap-3 rounded-xl border border-line p-3 text-left text-sm hover:bg-surface">
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                    <span className="min-w-0"><span className="block font-semibold">{x.label}</span>
                      <span className="block truncate text-xs text-muted">{Object.entries(x.fields || {}).map(([k, v]) => `${k}: ${v}`).join(" · ") || x.filename}</span></span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="card overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-5"><h2 className="font-bold">Products and quote</h2>{q && <span className="text-xs text-muted">{d.quote_is_snapshot ? "Snapshot at submission" : "Live draft"} · excl. taxes</span>}</div>
            {!q ? <p className="p-5 text-sm text-muted">No products selected yet.</p> : (
              <div className="overflow-x-auto p-5">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="text-left text-xs uppercase tracking-wider text-muted"><tr><th className="pb-2">Product</th><th className="pb-2">Qty</th><th className="pb-2">Monthly</th><th className="pb-2">Setup</th><th className="pb-2">ETA</th></tr></thead>
                  <tbody>
                    {q.items.map((i: any) => {
                      const s = d.tracking?.services?.find((x: any) => x.product_id === i.product_id);
                      return (
                        <tr key={i.product_id} className="border-t border-line"><td className="py-2 font-semibold">{i.name}<div className="text-xs font-normal text-muted">{i.product_id} · {i.unit}</div></td>
                          <td>{i.quantity}</td><td className="tabular-nums">{inrRange(i.monthly_min, i.monthly_max)}</td><td className="tabular-nums">{i.setup ? inr(i.setup) : "-"}</td><td className="text-xs">{s?.eta || `${i.install_days} days`}</td></tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="mt-3 flex flex-wrap gap-6 border-t border-line pt-3 text-sm">
                  <span>Monthly <b className="tabular-nums">{inrRange(q.monthly.min, q.monthly.max)}</b> (est. {inr(q.monthly.mid)})</span>
                  <span>Setup <b>{inr(q.setup_total)}</b></span>
                  {d.expected_activation && <span>All live by <b>{d.expected_activation}</b>{d.tracking?.sla_due && <span className="text-muted"> (SLA {d.tracking.sla_due})</span>}</span>}
                </div>
                {q.issues?.length > 0 && <Notice tone="warn" className="mt-3">{q.issues.join(" · ")}</Notice>}
              </div>
            )}
          </section>

          <section className="card p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-bold">What the customer told the advisor</h2>
              {nonEnglish && !english && <Button size="sm" variant="secondary" loading={busy === "tr"} onClick={() => act("tr", async () => setEnglish((await post("/translate")).english))}><Languages className="h-4 w-4" />Show English</Button>}
            </div>
            <div className="max-h-[340px] space-y-2 overflow-y-auto pr-1 text-sm">
              {(d.messages || []).map((m: any, i: number) => m.role !== "user" ? null : (
                <div key={i} className="rounded-xl bg-surface px-3 py-2">{m.text}
                  {english?.[i] && english[i] !== m.text && <div className="mt-1 border-t border-line pt-1 text-ink-2"><span className="text-xs font-semibold text-muted">EN: </span>{english[i]}</div>}
                </div>
              ))}
              {!d.messages?.length && <p className="text-muted">No conversation.</p>}
            </div>
          </section>
        </div>

        <aside className="space-y-5 xl:sticky xl:top-20">
          <NextAction key={d.status} d={d} post={post} setD={setD} />
          <section className="card p-5 text-sm">
            <h2 className="mb-3 font-bold">Business</h2>
            {[["Business", r.business_type], ["City", `${r.city || "-"} (tier ${r.city_tier ?? "?"})`], ["Employees", r.employee_count], ["Locations", r.num_sites],
              ["Needs", d.needs_labels.join(", ") || "-"]].map(([k, v]) => (
              <div key={k as string} className="flex justify-between gap-3 border-b border-line py-1.5 last:border-0"><span className="text-muted">{k}</span><span className="text-right font-semibold">{v ?? "-"}</span></div>
            ))}
          </section>
        </aside>
      </div>
    </div>
  );
}
