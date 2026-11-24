"use client";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { ArrowRight, CheckCircle2, FileUp, Loader2, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/components/hooks";
import KycResult from "@/components/KycResult";
import RequireCustomer from "@/components/RequireCustomer";
import { Stepper } from "@/components/SiteChrome";
import { useCodeText } from "@/components/codes";
import { Button, ErrorNote, Field, Notice, PageHeader, Skeleton, Status, cn } from "@/components/ui";

/* eslint-disable @typescript-eslint/no-explicit-any */
const MODES = ["gstin", "udyam", "both", "none"] as const;

function Verify() {
  const t = useTranslations("verify");
  const tc = useTranslations();
  const { data: k, setData: setK, error, reload } = useApi("/api/kyc");
  const [consent, setConsent] = useState(false);
  const [mode, setMode] = useState<string | null>(null);
  const [gstin, setGstin] = useState("");
  const [udyam, setUdyam] = useState("");
  const [bname, setBname] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const code = useCodeText();

  useEffect(() => {
    if (!k) return;
    setConsent(k.consent);
    setMode((m) => m ?? k.mode ?? null);
    setBname((b) => b || k.business_name || "");
  }, [k]);

  async function saveIds(nextMode = mode, nextConsent = consent) {
    setBusy("ids"); setErr(null);
    try { setK(await api("/api/kyc/identifiers", { method: "PUT", body: { consent: nextConsent, mode: nextMode, gstin, udyam, business_name: bname } })); setGstin(""); setUdyam(""); }
    catch (e) { setErr(e); } finally { setBusy(null); }
  }
  async function upload(dt: string, f?: File) {
    if (!f) return;
    setBusy(dt); setErr(null);
    const form = new FormData();
    form.append("doc_type", dt); form.append("file", f);
    try { setK(await api("/api/kyc/documents", { form })); } catch (e) { setErr(e); } finally { setBusy(null); }
  }
  async function del(id: number) {
    try { setK(await api(`/api/kyc/documents/${id}`, { method: "DELETE" })); } catch (e) { setErr(e); }
  }

  if (error && !k) return <div className="container-x py-10"><ErrorNote error={error} onRetry={reload} /></div>;
  if (!k) return <div className="container-x py-10"><Skeleton className="h-96" /></div>;
  const needG = mode === "gstin" || mode === "both";
  const needU = mode === "udyam" || mode === "both";
  const ready = k.consent && k.mode;

  return (
    <div className="container-x py-8">
      <Stepper current="verify" />
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-6">
          {/* 1. Consent */}
          <section className="card p-6">
            <h2 className="h2 mb-3">1. {t("consentTitle")}</h2>
            <label className="flex cursor-pointer gap-3 rounded-2xl bg-surface p-4 text-sm leading-relaxed">
              <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-[var(--color-brand)]" checked={consent}
                onChange={(e) => { setConsent(e.target.checked); if (!e.target.checked || k.consent !== e.target.checked) saveIds(mode, e.target.checked); }} />
              <span>{t("consentText")}</span>
            </label>
          </section>

          {/* 2. Registration type + identifiers */}
          <motion.section className={cn("card p-6 transition", !consent && "pointer-events-none opacity-50")} aria-disabled={!consent}>
            <h2 className="h2 mb-4">2. {t("modeTitle")}</h2>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
              {MODES.map((m) => (
                <button key={m} role="radio" aria-checked={mode === m} onClick={() => { setMode(m); if (m === "none") saveIds(m); }}
                  className={cn("rounded-2xl border px-4 py-3.5 text-left text-sm font-semibold transition",
                    mode === m ? "border-brand bg-brand-50 text-brand-900 ring-2 ring-brand/20" : "border-line-2 bg-white hover:border-ink-2/30")}>
                  {t(`mode_${m}`)}
                </button>
              ))}
            </div>
            {mode === "none" && <p className="mt-3 text-sm text-muted">{t("modeNoneNote")}</p>}
            {mode && (
              <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); saveIds(); }}>
                {needG && <Field label={t("gstinLabel")} hint={k.gstin_masked ? t("saved", { value: k.gstin_masked }) : undefined}>
                  <input className="input font-mono uppercase tracking-wider" maxLength={15} value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase().trim())} placeholder="22AAAAA0000A1Z5" />
                </Field>}
                {needU && <Field label={t("udyamLabel")} hint={k.udyam_masked ? t("saved", { value: k.udyam_masked }) : undefined}>
                  <input className="input font-mono uppercase" maxLength={19} value={udyam} onChange={(e) => setUdyam(e.target.value.toUpperCase().trim())} placeholder="UDYAM-XX-00-0000000" />
                </Field>}
                <Field label={t("businessName")}><input className="input" value={bname} onChange={(e) => setBname(e.target.value)} maxLength={150} /></Field>
                <div className="flex items-end"><Button type="submit" variant="dark" loading={busy === "ids"} disabled={(needG && !gstin && !k.gstin_masked) || (needU && !udyam && !k.udyam_masked)}>{t("check")}</Button></div>
              </form>
            )}
            {k.registry?.gstin && (
              <div className="mt-5 rounded-2xl border border-line bg-surface p-4 text-sm">
                <div className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">{t("prefill")} · GST</div>
                <div className="font-semibold">{k.registry.gstin.trade_name}</div>
                <div className="text-muted">{k.registry.gstin.legal_name} · {k.registry.gstin.constitution}</div>
                <div className="text-muted">{k.registry.gstin.address}</div>
                <div className="mt-2"><Status s={k.registry.gstin.status === "Active" ? "verified" : "action_required"} label={k.registry.gstin.status} /></div>
              </div>
            )}
            {k.registry?.udyam && (
              <div className="mt-3 rounded-2xl border border-line bg-surface p-4 text-sm">
                <div className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">{t("prefill")} · Udyam</div>
                <div className="font-semibold">{k.registry.udyam.enterprise_name}</div>
                <div className="text-muted">{k.registry.udyam.type} · {k.registry.udyam.activity} · {k.registry.udyam.city}, {k.registry.udyam.state}</div>
              </div>
            )}
            {k.gstin_products?.length > 0 && mode === "none" && <Notice tone="warn" className="mt-4">{t("gstinProducts", { products: k.gstin_products.join(", ") })}</Notice>}
          </motion.section>

          {/* 3. Documents */}
          {ready && (
            <section className="card p-6">
              <h2 className="h2">3. {t("docsTitle")}</h2>
              <p className="mb-4 mt-1 text-sm text-muted">{t("docsSubtitle")}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {k.required_documents.map((dt: string) => {
                  const d = k.documents.find((x: any) => x.doc_type === dt);
                  const ex = (k.checks as any[]).find((c) => c.doc_type === dt && c.stage === "extraction");
                  return (
                    <div key={dt} className={cn("rounded-2xl border p-4", d ? "border-line bg-white" : "border-dashed border-line-2 bg-surface")}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-semibold">{t(`doc_${dt}`)}</div>
                        {ex && <Status s={ex.status} />}
                      </div>
                      {d && <div className="mt-1 truncate text-xs text-muted">{d.filename}</div>}
                      {ex && ex.status !== "verified" && ex.status !== "pending" && <p className="mt-2 text-sm text-ink-2">{code(ex, ex.detail)}</p>}
                      <div className="mt-3 flex items-center gap-2">
                        <label className={cn("inline-flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition",
                          d ? "bg-surface-2 text-ink hover:bg-line" : "bg-ink text-white hover:bg-ink-2", busy === dt && "pointer-events-none opacity-60")}>
                          {busy === dt ? <Loader2 className="h-4 w-4 animate-spin" /> : d ? <CheckCircle2 className="h-4 w-4" /> : <FileUp className="h-4 w-4" />}
                          {busy === dt ? t("reading") : d ? t("replace") : t("upload")}
                          <input type="file" accept="image/png,image/jpeg" className="sr-only" disabled={busy === dt} onChange={(e) => { upload(dt, e.target.files?.[0]); e.target.value = ""; }} />
                        </label>
                        {d && <button onClick={() => del(d.id)} aria-label={t("delete")} className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-bad-bg hover:text-bad"><Trash2 className="h-4 w-4" /></button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
          <ErrorNote error={err} />
        </div>

        <aside className="card p-6 lg:sticky lg:top-24">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="h2">{t("resultTitle")}</h2>
            <Status s={k.overall} />
          </div>
          <KycResult k={k} />
          <p className="mt-4 text-xs text-muted">{tc("brand.disclaimer")}</p>
          <Button className="mt-5 w-full" size="lg" href="/review" disabled={!ready}>{t("toReview")}<ArrowRight className="h-4 w-4" /></Button>
        </aside>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return <RequireCustomer><Verify /></RequireCustomer>;
}
