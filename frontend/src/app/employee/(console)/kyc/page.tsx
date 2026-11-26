"use client";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, CheckCircle2, Clock3, FileWarning, Maximize2, ScanSearch, Wrench, X } from "lucide-react";
import { api, authBlobUrl } from "@/lib/api";
import KycResult from "@/components/KycResult";
import { ErrorNote, Skeleton, cn } from "@/components/ui";

/* eslint-disable @typescript-eslint/no-explicit-any */
const VERDICT: Record<string, { label: string; pill: string; dot: string; icon: any }> = {
  pass: { label: "Passed", pill: "bg-ok-bg text-ok", dot: "bg-ok", icon: CheckCircle2 },
  ask: { label: "Customer fixes", pill: "bg-warn-bg text-warn", dot: "bg-warn", icon: Wrench },
  hold: { label: "Team review", pill: "bg-info-bg text-info", dot: "bg-info", icon: Clock3 },
};
const DOC_ORDER = ["gst_certificate", "udyam_certificate", "signatory_id", "address_proof"];
const DOC_SHORT: Record<string, string> = { gst_certificate: "GST", udyam_certificate: "Udyam", signatory_id: "ID", address_proof: "Bill" };
const IDS = Array.from({ length: 12 }, (_, i) => `K${String(i + 1).padStart(2, "0")}`);

function VerdictPill({ v, big }: { v?: string; big?: boolean }) {
  const x = v ? VERDICT[v] : null;
  if (!x) return null;
  const Icon = x.icon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full font-semibold", x.pill, big ? "px-3.5 py-1.5 text-sm" : "px-2 py-0.5 text-[11px]")}>
      <Icon className={big ? "h-4 w-4" : "h-3 w-3"} />{x.label}
    </span>
  );
}

/** Large preview of one document (protected image, loaded with the staff session). */
function DocViewer({ kid, dt, label, onZoom }: { kid: string; dt: string; label: string; onZoom: (u: string) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | null = null;
    setUrl(null);
    authBlobUrl(`/api/employee/specimens/${kid}/${dt}`).then((x) => { u = x; setUrl(x); }).catch(() => setUrl(null));
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [kid, dt]);
  return (
    <button onClick={() => url && onZoom(url)} className="group relative block w-full overflow-hidden rounded-2xl border border-line bg-surface" aria-label={`Enlarge ${label}`}>
      <div className="aspect-[4/3]">
        {url ? <img src={url} alt={label} className="h-full w-full object-contain transition group-hover:scale-[1.02]" /> : <Skeleton className="h-full w-full" />}
      </div>
      <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-ink/80 px-2.5 py-1 text-xs font-semibold text-white opacity-0 transition group-hover:opacity-100">
        <Maximize2 className="h-3.5 w-3.5" />Enlarge
      </span>
    </button>
  );
}

/** Run any of the case pack's 12 specimen applicants through the live Smart KYC engine. Nothing is stored. */
export default function KycCheck() {
  const [list, setList] = useState<any[] | null>(null);
  const [sel, setSel] = useState("K01");
  const [filter, setFilter] = useState<string>("all");
  const [d, setD] = useState<any>(null);
  const [doc, setDoc] = useState<string>("gst_certificate");
  const [err, setErr] = useState<unknown>(null);
  const [zoom, setZoom] = useState<string | null>(null);

  useEffect(() => { api("/api/employee/specimens", { as: "employee" }).then((r) => setList(r.specimens)).catch(setErr); }, []);
  useEffect(() => {
    setD(null);
    api(`/api/employee/specimens/${sel}`, { as: "employee" }).then((r) => {
      setD(r);
      const first = DOC_ORDER.find((t) => r.documents.some((x: any) => x.doc_type === t));
      setDoc(first || "gst_certificate");
    }).catch(setErr);
  }, [sel]);

  const rows: any[] = list || IDS.map((id) => ({ id }));
  const counts = rows.reduce((a: any, s: any) => ({ ...a, [s.verdict]: (a[s.verdict] || 0) + 1 }), {});
  const shown = rows.filter((s) => filter === "all" || s.verdict === filter);
  const idx = IDS.indexOf(sel);
  const go = (step: number) => setSel(IDS[(idx + step + IDS.length) % IDS.length]);
  const docOf = (t: string) => d?.documents.find((x: any) => x.doc_type === t);
  const issuesFor = (t: string) => (d?.checks || []).filter((c: any) => c.doc_type === t && c.status !== "verified").length;

  return (
    <div className="space-y-5">
      {/* Header + summary */}
      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight"><ScanSearch className="h-6 w-6 text-brand" />KYC check</h1>
          <p className="max-w-2xl text-sm text-muted">The 12 sample applicants from the case pack, run through the same engine customers use: on-server OCR, watermark removal, tilt correction, look-alike repair and registry checks. Nothing is saved.</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(VERDICT).map(([k, v]) => {
            const Icon = v.icon;
            return (
              <div key={k} className="card flex items-center gap-3 px-4 py-3">
                <span className={cn("grid h-9 w-9 place-items-center rounded-xl", v.pill)}><Icon className="h-4 w-4" /></span>
                <div><div className="font-display text-xl font-bold leading-none tabular-nums">{counts[k] ?? "–"}</div><div className="mt-1 text-xs text-muted">{v.label}</div></div>
              </div>
            );
          })}
        </div>
      </div>
      <ErrorNote error={err} />

      <div className="grid items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* Applicant list */}
        <aside className="card overflow-hidden lg:sticky lg:top-24">
          <div className="flex flex-wrap gap-1.5 border-b border-line p-3">
            {[["all", "All"], ["pass", "Passed"], ["ask", "Fixes"], ["hold", "Review"]].map(([k, label]) => (
              <button key={k} onClick={() => setFilter(k)}
                className={cn("rounded-full px-3 py-1 text-xs font-semibold transition", filter === k ? "bg-ink text-white" : "bg-surface text-ink-2 hover:bg-surface-2")}>
                {label}{k !== "all" && counts[k] ? ` ${counts[k]}` : ""}
              </button>
            ))}
          </div>
          <ul className="max-h-[70vh] divide-y divide-line overflow-y-auto">
            {shown.map((s) => (
              <li key={s.id}>
                <button onClick={() => setSel(s.id)}
                  className={cn("relative flex w-full items-start gap-3 px-4 py-3 text-left transition", sel === s.id ? "bg-brand-50/60" : "hover:bg-surface")}>
                  {sel === s.id && <span className="absolute inset-y-0 left-0 w-1 bg-brand" />}
                  <span className="mt-0.5 rounded-lg bg-ink px-1.5 py-0.5 font-mono text-[11px] font-bold text-white">{s.id}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{s.business || "…"}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted">{s.flags?.length ? s.flags.join(" · ") : s.verdict ? "No issues" : ""}</span>
                  </span>
                  {s.verdict && <span className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", VERDICT[s.verdict]?.dot)} title={VERDICT[s.verdict]?.label} />}
                </button>
              </li>
            ))}
            {shown.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">No applicants in this group.</li>}
          </ul>
        </aside>

        {/* Applicant workspace */}
        {!d ? <Skeleton className="h-[560px]" /> : (
          <section className="card overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
              <span className="rounded-lg bg-ink px-2 py-1 font-mono text-sm font-bold text-white">{d.id}</span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-display text-xl font-bold">{d.business}</h2>
                <div className="text-xs text-muted">GSTIN {d.gstin_masked || "-"} · Udyam {d.udyam_masked || "-"}</div>
              </div>
              <VerdictPill v={d.verdict} big />
              <div className="flex gap-1">
                <button onClick={() => go(-1)} aria-label="Previous applicant" className="grid h-9 w-9 place-items-center rounded-full border border-line hover:bg-surface"><ChevronLeft className="h-4 w-4" /></button>
                <button onClick={() => go(1)} aria-label="Next applicant" className="grid h-9 w-9 place-items-center rounded-full border border-line hover:bg-surface"><ChevronRight className="h-4 w-4" /></button>
              </div>
            </div>

            <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
              {/* Document viewer */}
              <div>
                <div className="mb-3 grid grid-cols-4 gap-1 rounded-2xl bg-surface p-1">
                  {DOC_ORDER.map((t) => {
                    const has = !!docOf(t), n = issuesFor(t);
                    return (
                      <button key={t} onClick={() => has && setDoc(t)} disabled={!has}
                        className={cn("relative rounded-xl px-2 py-2 text-xs font-semibold transition",
                          doc === t && has ? "bg-white text-ink shadow-[var(--shadow-card)]" : "text-muted hover:text-ink", !has && "cursor-not-allowed opacity-50")}>
                        {DOC_SHORT[t]}
                        {!has ? <span className="ml-1 text-bad">· missing</span> : n > 0 && <span className="ml-1.5 inline-grid h-4 min-w-4 place-items-center rounded-full bg-warn px-1 text-[10px] text-white">{n}</span>}
                      </button>
                    );
                  })}
                </div>
                {docOf(doc) ? (
                  <>
                    <DocViewer kid={d.id} dt={doc} label={docOf(doc).label} onZoom={setZoom} />
                    <div className="mt-2 text-xs font-semibold text-ink-2">{docOf(doc).label}</div>
                  </>
                ) : (
                  <div className="grid aspect-[4/3] place-items-center rounded-2xl border border-dashed border-line-2 bg-surface text-center text-sm text-muted">
                    <div><FileWarning className="mx-auto mb-2 h-6 w-6" />Missing document</div>
                  </div>
                )}
                {d.registry?.gstin && (
                  <div className="mt-4 rounded-2xl border border-line bg-surface p-3 text-xs">
                    <div className="mb-1 font-bold uppercase tracking-wider text-muted">GST registry</div>
                    <div className="font-semibold text-ink">{d.registry.gstin.legal_name}</div>
                    <div className="text-muted">{d.registry.gstin.constitution} · {d.registry.gstin.status}</div>
                  </div>
                )}
              </div>

              {/* Findings */}
              <div><KycResult k={d} staff /></div>
            </div>
          </section>
        )}
      </div>

      {zoom && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/70 p-6 backdrop-blur-sm" onClick={() => setZoom(null)}>
          <button className="absolute right-5 top-5 grid h-10 w-10 place-items-center rounded-full bg-white" aria-label="Close"><X className="h-5 w-5" /></button>
          <img src={zoom} alt="Document" className="max-h-[88vh] max-w-full rounded-2xl bg-white shadow-2xl" />
        </div>
      )}
    </div>
  );
}
