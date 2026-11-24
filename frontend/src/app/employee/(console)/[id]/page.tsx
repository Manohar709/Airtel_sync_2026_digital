"use client";
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bot, FileText, Languages, Phone } from "lucide-react";
import { api, documentUrl } from "@/lib/api";
import { dateTime, inr, inrRange } from "@/lib/format";
import { Button, ErrorNote, Notice, Skeleton, Status, cn } from "@/components/ui";

/* eslint-disable @typescript-eslint/no-explicit-any */
const LABEL: Record<string, string> = {
  submitted: "Submitted", in_review: "In review", awaiting_customer: "Awaiting customer", ready_for_activation: "Ready for activation",
  closed: "Closed", draft: "Draft", verified: "Verified", action_required: "Action required", needs_manual_review: "Needs manual review",
  pending: "Pending", unable_to_verify: "Unable to verify", open: "Help requested", in_progress: "Help in progress", resolved: "Help resolved",
  eligible: "Eligible", prerequisite_required: "Prerequisite required", not_eligible: "Not eligible",
};
const STAGES = { format: "Format", registry: "Registry", extraction: "Documents", consistency: "Cross-checks" } as const;
const MODE: Record<string, string> = { gstin: "GSTIN", udyam: "Udyam", both: "GSTIN + Udyam", none: "No registration" };

export default function Detail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<unknown>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
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
      <Link href="/employee" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" />All applications</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-extrabold tracking-[-0.02em]">#{d.id} · {d.customer}</h1>
        {d.is_guest && <span className="rounded bg-surface-2 px-2 py-0.5 text-xs font-bold text-muted">GUEST</span>}
        <Status s={d.status} label={LABEL[d.status]} /><Status s={d.kyc.overall} label={`KYC: ${LABEL[d.kyc.overall]}`} />
      </div>
      <ErrorNote error={err} />

      {d.help_requested && (
        <div className={cn("card flex flex-wrap items-center justify-between gap-4 border-l-4 p-5", d.help_status === "resolved" ? "border-l-ok" : "border-l-brand")}>
          <div>
            <div className="flex items-center gap-2 font-bold"><Phone className="h-4 w-4 text-brand" />Customer asked for help · <Status s={d.help_status} label={LABEL[d.help_status]} /></div>
            <p className="mt-1 text-sm">{d.help_note || "No note left."}</p>
            <p className="mt-1 text-xs text-muted">{d.phone || "-"} · {d.email || "guest"} · {dateTime(d.help_at)}</p>
          </div>
          <div className="flex gap-2">
            {d.help_status === "open" && <Button size="sm" variant="dark" loading={busy === "hp"} onClick={() => act("hp", async () => setD(await post("/help", { status: "in_progress" })))}>Take it</Button>}
            {d.help_status !== "resolved" && <Button size="sm" variant="secondary" loading={busy === "hr"} onClick={() => act("hr", async () => setD(await post("/help", { status: "resolved" })))}>Mark resolved</Button>}
          </div>
        </div>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          <section className="card p-5">
            <h2 className="mb-3 font-bold">Business and confirmed requirements</h2>
            <div className="grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
              {[["Business", r.business_type], ["City", `${r.city || "-"} (tier ${r.city_tier ?? "unknown"})`], ["Employees", r.employee_count], ["Locations", r.num_sites],
                ["Has GSTIN", r.has_gstin == null ? "unknown" : r.has_gstin ? "yes" : "no"], ["Current internet", r.current_internet || "not given"],
                ["Budget", r.monthly_budget_inr != null ? inr(r.monthly_budget_inr) : "not given"], ["Language", d.language?.toUpperCase()]].map(([k, v]) => (
                <div key={k as string} className="flex justify-between gap-3 border-b border-line py-1.5"><span className="text-muted">{k}</span><span className="font-semibold">{v ?? "-"}</span></div>
              ))}
              <div className="flex justify-between gap-3 py-1.5 sm:col-span-2"><span className="text-muted">Needs</span><span className="text-right font-semibold">{d.needs_labels.join(", ") || "-"}</span></div>
            </div>
          </section>

          <section className="card overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-5"><h2 className="font-bold">Products and quote</h2>{q && <span className="text-xs text-muted">{d.quote_is_snapshot ? "Snapshot at submission" : "Live (not yet submitted)"} · excl. taxes</span>}</div>
            {!q ? <p className="p-5 text-sm text-muted">No products selected yet.</p> : (
              <div className="overflow-x-auto p-5">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="text-left text-xs uppercase tracking-wider text-muted"><tr><th className="pb-2">Product</th><th className="pb-2">Qty</th><th className="pb-2">Monthly</th><th className="pb-2">Setup</th><th className="pb-2">Status</th></tr></thead>
                  <tbody>
                    {q.items.map((i: any) => (
                      <tr key={i.product_id} className="border-t border-line"><td className="py-2 font-semibold">{i.name}<div className="text-xs font-normal text-muted">{i.product_id} · {i.unit}</div></td>
                        <td>{i.quantity}</td><td className="tabular-nums">{inrRange(i.monthly_min, i.monthly_max)}</td><td className="tabular-nums">{i.setup ? inr(i.setup) : "-"}</td><td><Status s={i.status} label={LABEL[i.status]} /></td></tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-3 flex flex-wrap gap-6 border-t border-line pt-3 text-sm">
                  <span>Monthly <b className="tabular-nums">{inrRange(q.monthly.min, q.monthly.max)}</b> (est. {inr(q.monthly.mid)})</span>
                  <span>Setup <b>{inr(q.setup_total)}</b></span>
                  {d.expected_activation && <span>Expected activation <b>{d.expected_activation}</b> (estimate)</span>}
                </div>
                {q.issues?.length > 0 && <Notice tone="warn" className="mt-3">{q.issues.join(" · ")}</Notice>}
              </div>
            )}
          </section>

          <section className="card p-5">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <h2 className="font-bold">KYC</h2><Status s={d.kyc.overall} label={LABEL[d.kyc.overall]} />
              <span className="text-xs text-muted">{MODE[d.kyc.mode] || "Not started"} · GSTIN {d.kyc.gstin_masked || "-"} · Udyam {d.kyc.udyam_masked || "-"}{d.kyc.submitted_snapshot ? ` · at submission: ${LABEL[d.kyc.submitted_snapshot]}` : ""}</span>
            </div>
            <div className="space-y-4">
              {Object.entries(STAGES).map(([st, title]) => {
                const rows = d.kyc.checks.filter((c: any) => c.stage === st);
                if (!rows.length) return null;
                return (
                  <div key={st}>
                    <div className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted">{title}</div>
                    <ul className="divide-y divide-line rounded-xl border border-line">
                      {rows.map((c: any) => (
                        <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 px-3 py-2 text-sm">
                          <span><b>{c.label}.</b> {c.detail}</span><Status s={c.status} label={LABEL[c.status]} />
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
            {d.kyc.registry?.gstin && <p className="mt-3 text-xs text-muted">Registry: {d.kyc.registry.gstin.legal_name} · {d.kyc.registry.gstin.constitution} · {d.kyc.registry.gstin.address} · {d.kyc.registry.gstin.status}</p>}
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
            <p className="mt-3 text-xs text-muted">{d.kyc.note}</p>
          </section>

          <section className="card p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-bold">Conversation</h2>
              {nonEnglish && !english && <Button size="sm" variant="secondary" loading={busy === "tr"} onClick={() => act("tr", async () => setEnglish((await post("/translate")).english))}><Languages className="h-4 w-4" />Show English</Button>}
            </div>
            <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1 text-sm">
              {(d.messages || []).map((m: any, i: number) => (
                <div key={i} className={cn("rounded-xl px-3 py-2", m.role === "user" ? "bg-surface" : "border border-line")}>
                  <div className="text-xs font-bold text-muted">{m.role === "user" ? "Customer" : m.fallback ? "Advisor (basic mode)" : "Advisor"}</div>
                  <div>{m.fallback && m.asked ? `[asked: ${m.asked}]` : m.text}</div>
                  {english?.[i] && english[i] !== m.text && <div className="mt-1 border-t border-line pt-1 text-ink-2"><span className="text-xs font-semibold text-muted">EN: </span>{english[i]}</div>}
                </div>
              ))}
              {!d.messages?.length && <p className="text-muted">No conversation.</p>}
            </div>
          </section>
        </div>

        <aside className="space-y-5 xl:sticky xl:top-20">
          <section className="card p-5">
            <h2 className="mb-3 font-bold">Status</h2>
            <div className="flex flex-wrap gap-2">
              {d.allowed_transitions.length === 0 && <span className="text-sm text-muted">{d.status === "draft" ? "Draft: the customer has not submitted yet." : "No further transitions."}</span>}
              {d.allowed_transitions.filter((s: string) => s !== "submitted").map((s: string) => (
                <Button key={s} size="sm" variant={s === "ready_for_activation" ? "primary" : "secondary"} loading={busy === s}
                  onClick={() => act(s, async () => { setD(await post("/status", { status: s, note })); setNote(""); })}>{LABEL[s]}</Button>
              ))}
            </div>
            <textarea className="input mt-3 min-h-20 text-sm" placeholder="Internal note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            <Button size="sm" variant="ghost" className="mt-2" disabled={!note.trim()} loading={busy === "note"} onClick={() => act("note", async () => { setD(await post("/notes", { text: note })); setNote(""); })}>Add note only</Button>
            <ol className="mt-4 space-y-2 border-t border-line pt-3 text-xs">
              {d.events.map((e: any, i: number) => <li key={i} className="flex justify-between gap-2"><span className="font-semibold">{e.kind}{e.status ? `: ${LABEL[e.status] || e.status}` : ""}</span><span className="text-muted">{dateTime(e.at)} · {e.by}</span></li>)}
            </ol>
            {d.notes.length > 0 && <div className="mt-3 space-y-2 border-t border-line pt-3">{d.notes.map((n: any, i: number) => <div key={i} className="text-xs"><b>{n.by}</b> · {dateTime(n.at)}<div className="text-sm">{n.text}</div></div>)}</div>}
          </section>

          <section className="card p-5">
            <div className="mb-1 flex items-center gap-2 font-bold"><Bot className="h-4 w-4 text-brand" />AI assistant</div>
            <p className="mb-3 text-xs text-muted">Uses only this application (identifiers masked, no document images). Cannot approve KYC or applications.</p>
            <Button size="sm" variant="secondary" className="w-full" loading={busy === "sum"} onClick={() => act("sum", async () => setSummary((await post("/summary")).summary))}>Summarise application</Button>
            {summary && <div className="mt-3 whitespace-pre-wrap rounded-xl bg-surface p-3 text-sm">{summary}</div>}
            <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); act("ask", async () => setAnswer((await post("/ask", { message: question })).answer)); }}>
              <input className="input h-9 py-1.5 text-sm" placeholder="Ask about this application" value={question} onChange={(e) => setQuestion(e.target.value)} />
              <Button size="sm" variant="dark" disabled={!question.trim()} loading={busy === "ask"}>Ask</Button>
            </form>
            {answer && <div className="mt-3 whitespace-pre-wrap rounded-xl bg-surface p-3 text-sm">{answer}</div>}
          </section>
        </aside>
      </div>
    </div>
  );
}
