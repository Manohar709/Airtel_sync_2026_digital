"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, Clock3, ScanSearch, Wrench, X } from "lucide-react";
import { api, authBlobUrl } from "@/lib/api";
import KycResult from "@/components/KycResult";
import { ErrorNote, Skeleton, cn } from "@/components/ui";

/* eslint-disable @typescript-eslint/no-explicit-any */
const VERDICT: Record<string, { label: string; cls: string; icon: any }> = {
  pass: { label: "Passed", cls: "bg-ok-bg text-ok", icon: CheckCircle2 },
  ask: { label: "Customer fixes", cls: "bg-warn-bg text-warn", icon: Wrench },
  hold: { label: "Team review", cls: "bg-info-bg text-info", icon: Clock3 },
};

function DocImage({ kid, dt, label, onOpen }: { kid: string; dt: string; label: string; onOpen: (u: string) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | null = null;
    authBlobUrl(`/api/employee/specimens/${kid}/${dt}`).then((x) => { u = x; setUrl(x); }).catch(() => setUrl(null));
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [kid, dt]);
  return (
    <button onClick={() => url && onOpen(url)} className="group overflow-hidden rounded-2xl border border-line bg-white text-left">
      <div className="aspect-[4/3] overflow-hidden bg-surface">
        {url ? <img src={url} alt={label} className="h-full w-full object-cover object-top transition group-hover:scale-[1.03]" /> : <Skeleton className="h-full w-full" />}
      </div>
      <div className="px-3 py-2 text-xs font-semibold text-ink-2">{label}</div>
    </button>
  );
}

/** Run any of the case pack's 12 specimen applicants through the live Smart KYC engine. Nothing is stored. */
export default function KycCheck() {
  const [list, setList] = useState<any[] | null>(null);
  const [sel, setSel] = useState("K01");
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<unknown>(null);
  const [zoom, setZoom] = useState<string | null>(null);

  useEffect(() => { api("/api/employee/specimens", { as: "employee" }).then((r) => setList(r.specimens)).catch(setErr); }, []);
  useEffect(() => { setD(null); api(`/api/employee/specimens/${sel}`, { as: "employee" }).then(setD).catch(setErr); }, [sel]);

  const counts = (list || []).reduce((a: any, s: any) => ({ ...a, [s.verdict]: (a[s.verdict] || 0) + 1 }), {});
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight"><ScanSearch className="h-6 w-6 text-brand" />KYC check</h1>
          <p className="max-w-2xl text-sm text-muted">The 12 sample applicants from the case pack, run through the same engine customers use: on-server OCR, watermark removal, tilt correction, look-alike repair and registry checks. Nothing is saved.</p>
        </div>
        <div className="flex gap-2 text-sm">
          {Object.entries(VERDICT).map(([k, v]) => <span key={k} className={cn("rounded-full px-3 py-1.5 font-semibold", v.cls)}>{v.label}: {counts[k] ?? "–"}</span>)}
        </div>
      </div>
      <ErrorNote error={err} />

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 xl:grid-cols-12">
        {(list || Array.from({ length: 12 }, (_, i) => ({ id: `K${String(i + 1).padStart(2, "0")}` }))).map((s: any) => {
          const v = VERDICT[s.verdict];
          const Icon = v?.icon;
          return (
            <button key={s.id} onClick={() => setSel(s.id)}
              className={cn("rounded-2xl border bg-white p-3 text-left transition", sel === s.id ? "border-ink ring-2 ring-ink" : "border-line hover:border-ink/30")}>
              <div className="flex items-center justify-between"><span className="font-mono text-sm font-bold">{s.id}</span>{Icon && <Icon className={cn("h-4 w-4", v.cls.split(" ")[1])} />}</div>
              <div className="mt-1 truncate text-[11px] text-muted">{s.business || "…"}</div>
            </button>
          );
        })}
      </div>

      {!d ? <Skeleton className="h-96" /> : (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <section className="card p-5">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <h2 className="font-display text-xl font-bold">{d.id} · {d.business}</h2>
              <span className="text-xs text-muted">GSTIN {d.gstin_masked || "-"} · Udyam {d.udyam_masked || "-"}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {d.documents.map((x: any) => <DocImage key={x.doc_type} kid={d.id} dt={x.doc_type} label={x.label} onOpen={setZoom} />)}
              {d.documents.length < 4 && <div className="grid place-items-center rounded-2xl border border-dashed border-line-2 p-6 text-center text-xs text-muted">Missing document</div>}
            </div>
            {d.registry?.gstin && <p className="mt-4 rounded-xl bg-surface p-3 text-xs text-muted"><b className="text-ink-2">Registry:</b> {d.registry.gstin.legal_name} · {d.registry.gstin.constitution} · {d.registry.gstin.status}</p>}
          </section>
          <section className="card p-5"><KycResult k={d} staff /></section>
        </div>
      )}

      {zoom && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/70 p-6 backdrop-blur-sm" onClick={() => setZoom(null)}>
          <button className="absolute right-5 top-5 grid h-10 w-10 place-items-center rounded-full bg-white" aria-label="Close"><X className="h-5 w-5" /></button>
          <img src={zoom} alt="Document" className="max-h-[88vh] max-w-full rounded-2xl bg-white shadow-2xl" />
        </div>
      )}
    </div>
  );
}
