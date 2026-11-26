"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, CheckCircle2, FileUp, Fingerprint, FlaskConical, Loader2, Lock, Smartphone, Trash2 } from "lucide-react";
import SmsToast from "@/components/SmsToast";
import { api } from "@/lib/api";
import { useApi } from "@/components/hooks";
import KycResult from "@/components/KycResult";
import RequireCustomer from "@/components/RequireCustomer";
import { Stepper } from "@/components/SiteChrome";
import { useCodeText } from "@/components/codes";
import { Button, ErrorNote, Field, Notice, PageHeader, Skeleton, Status, cn } from "@/components/ui";

/* eslint-disable @typescript-eslint/no-explicit-any */

function Step({ n, title, done, locked, children }: { n: number; title: string; done?: boolean; locked?: boolean; children: React.ReactNode }) {
  return (
    <section className={cn("card p-6 transition", locked && "pointer-events-none opacity-50")} aria-disabled={locked}>
      <h2 className="h2 mb-4 flex items-center gap-3">
        <span className={cn("grid h-7 w-7 place-items-center rounded-full text-sm font-bold", done ? "bg-ok text-white" : "bg-ink text-white")}>
          {done ? <CheckCircle2 className="h-4 w-4" /> : n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function PhoneStep({ k, setK }: { k: any; setK: (v: any) => void }) {
  const t = useTranslations("verify");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  if (k.phone_verified) return <Notice tone="ok">{t("phoneDone", { phone: k.phone_masked || "" })}</Notice>;
  async function send() {
    setBusy(true); setErr(null);
    try { setSent(await api("/api/kyc/otp/send", { method: "POST", body: { phone } })); } catch (e) { setErr(e); } finally { setBusy(false); }
  }
  async function verify() {
    setBusy(true); setErr(null);
    try { setK(await api("/api/kyc/otp/verify", { method: "POST", body: { code } })); } catch (e) { setErr(e); } finally { setBusy(false); }
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">{t("phoneHint")}</p>
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t("phoneLabel")}>
          <input className="input w-56 font-mono" inputMode="numeric" maxLength={13} value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d+]/g, ""))} placeholder="98XXXXXXXX" />
        </Field>
        <Button variant={sent ? "ghost" : "dark"} loading={busy && !sent} disabled={phone.length < 10} onClick={send}>{sent ? t("resend") : t("sendCode")}</Button>
      </div>
      {sent && (
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t("codeLabel")}>
            <input className="input w-40 text-center font-mono text-lg tracking-[0.4em]" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus />
          </Field>
          <Button loading={busy} disabled={code.length !== 6} onClick={verify}>{t("verifyCode")}</Button>
        </div>
      )}
      <SmsToast code={sent?.demo_code} to={sent?.to} onUse={setCode} />
      <ErrorNote error={err} />
    </div>
  );
}

function DigiLocker({ k, setK }: { k: any; setK: (v: any) => void }) {
  const t = useTranslations("verify");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [last4, setLast4] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  if (k.digilocker) return <Notice tone="ok">{t("digiDone", { name: k.digilocker.name, last4: k.digilocker.last4 })}</Notice>;
  if (!open) return (
    <button onClick={() => setOpen(true)} disabled={!k.phone_verified}
      className="flex w-full items-center justify-center gap-2 rounded-full bg-[#1f3a8a] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1a3176] disabled:cursor-not-allowed disabled:opacity-50">
      <Fingerprint className="h-4 w-4" />{t("digiTitle")}
    </button>
  );
  async function start() {
    setBusy(true); setErr(null);
    try { setSent(await api("/api/kyc/digilocker/start", { method: "POST" })); } catch (e) { setErr(e); } finally { setBusy(false); }
  }
  async function verify() {
    setBusy(true); setErr(null);
    try { setK(await api("/api/kyc/digilocker", { method: "POST", body: { name, aadhaar_last4: last4, code } })); } catch (e) { setErr(e); } finally { setBusy(false); }
  }
  return (
    <div className="space-y-3 rounded-2xl border border-[#1f3a8a]/20 bg-[#f2f5fc] p-4">
      <div className="flex items-center gap-2 font-semibold text-[#1f3a8a]"><Fingerprint className="h-4 w-4" />{t("digiTitle")}</div>
      <p className="text-xs text-muted">{t("digiHint")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("digiName")}><input className="input" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label={t("digiLast4")}><input className="input font-mono" inputMode="numeric" maxLength={4} value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, ""))} placeholder="1234" /></Field>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted"><Lock className="h-3 w-3" />{t("digiNote")}</p>
      {!sent ? <Button variant="dark" loading={busy} disabled={name.trim().length < 2 || last4.length !== 4} onClick={start}>{t("digiStart")}</Button> : (
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t("codeLabel")}><input className="input w-40 text-center font-mono tracking-[0.4em]" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus /></Field>
          <Button loading={busy} disabled={code.length !== 6} onClick={verify}>{t("digiVerify")}</Button>
        </div>
      )}
      <SmsToast code={sent?.demo_code} to={sent?.to} onUse={setCode} />
      <ErrorNote error={err} />
    </div>
  );
}

const DOCS = ["gst_certificate", "udyam_certificate", "signatory_id", "address_proof"] as const;
const SAMPLES = Array.from({ length: 12 }, (_, i) => `K${String(i + 1).padStart(2, "0")}`);

function Verify() {
  const t = useTranslations("verify");
  const tc = useTranslations();
  const { data: k, setData: setK, error, reload } = useApi("/api/kyc");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const code = useCodeText();

  async function run(key: string, fn: () => Promise<any>) {
    setBusy(key); setErr(null);
    try { setK(await fn()); } catch (e) { setErr(e); } finally { setBusy(null); }
  }
  const upload = (dt: string, f?: File) => {
    if (!f) return;
    const form = new FormData();
    form.append("doc_type", dt); form.append("file", f);
    run(dt, () => api("/api/kyc/documents", { form }));
  };

  if (error && !k) return <div className="container-x py-10"><ErrorNote error={error} onRetry={reload} /></div>;
  if (!k) return <div className="container-x py-10"><Skeleton className="h-96" /></div>;
  const required: string[] = k.required_documents || [];
  const missing = required.filter((dt) => !k.documents.some((d: any) => d.doc_type === dt));
  const docBusy = busy && !["consent", "city"].includes(busy);

  return (
    <div className="container-x py-8">
      <Stepper current="verify" />
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-6">
          <Step n={1} title={t("consentTitle")} done={k.consent}>
            <label className="flex cursor-pointer gap-3 rounded-2xl bg-surface p-4 text-sm leading-relaxed">
              <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-[var(--color-brand)]" checked={!!k.consent} disabled={busy === "consent"}
                onChange={(e) => { const v = e.target.checked; setK({ ...k, consent: v }); run("consent", () => api("/api/kyc/consent", { method: "PUT", body: { consent: v } })); }} />
              <span>{t("consentText")}</span>
            </label>
          </Step>

          <Step n={2} title={t("phoneTitle")} done={k.phone_verified} locked={!k.consent}>
            <PhoneStep k={k} setK={setK} />
          </Step>

          <Step n={3} title={t("docsTitle")} locked={!k.consent} done={k.consent && missing.length === 0}>
            <p className="-mt-2 mb-4 text-sm text-muted">
              {k.gstin_products?.length ? t("docsNeedGst", { products: k.gstin_products.join(", ") }) : t("docsNoGst")}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {DOCS.map((dt) => {
                const d = k.documents.find((x: any) => x.doc_type === dt);
                const isReq = required.includes(dt) || (dt === "signatory_id" && !!k.digilocker);
                const issues = (k.checks as any[]).filter((c) => c.doc_type === dt && c.status !== "verified" && c.code !== "doc.not_uploaded");
                const reading = busy === dt;
                return (
                  <div key={dt} className={cn("rounded-2xl border p-4", d ? "border-line bg-white" : "border-dashed border-line-2 bg-surface")}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold">{t(`doc_${dt}`)}</div>
                        <div className={cn("mt-0.5 text-xs font-semibold", isReq ? "text-brand" : "text-subtle")}>{isReq ? t("required") : t("optional")}</div>
                      </div>
                      {d && <Status s={issues.some((c) => c.status === "action_required") ? "action_required" : issues.length ? "needs_manual_review" : "verified"} />}
                    </div>
                    {d && <div className="mt-1 truncate text-xs text-muted">{d.filename}</div>}
                    {issues.slice(0, 2).map((c, i) => <p key={i} className="mt-2 text-sm text-ink-2">{code(c, c.detail)}</p>)}
                    {reading && <p className="mt-2 text-xs text-muted">{t("readingHint")}</p>}
                    {!(dt === "signatory_id" && k.digilocker) && (
                      <div className="mt-3 flex items-center gap-2">
                        <label className={cn("inline-flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition",
                          d ? "bg-surface-2 text-ink hover:bg-line" : "bg-ink text-white hover:bg-ink-2", docBusy && "pointer-events-none opacity-60")}>
                          {reading ? <Loader2 className="h-4 w-4 animate-spin" /> : d ? <CheckCircle2 className="h-4 w-4" /> : <FileUp className="h-4 w-4" />}
                          {reading ? t("reading") : d ? t("replace") : t("upload")}
                          <input type="file" accept="image/png,image/jpeg" className="sr-only" disabled={!!docBusy} onChange={(e) => { upload(dt, e.target.files?.[0]); e.target.value = ""; }} />
                        </label>
                        {d && <button onClick={() => run("del", () => api(`/api/kyc/documents/${d.id}`, { method: "DELETE" }))} aria-label={t("delete")} className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-bad-bg hover:text-bad"><Trash2 className="h-4 w-4" /></button>}
                      </div>
                    )}
                    {dt === "signatory_id" && (
                      <div className="mt-3 space-y-2">
                        {!k.digilocker && !d && <div className="text-center text-xs font-semibold uppercase tracking-wider text-subtle">{t("or")}</div>}
                        {!d && <DigiLocker k={k} setK={setK} />}
                        {!k.phone_verified && !k.digilocker && !d && <p className="text-xs text-muted"><Smartphone className="mr-1 inline h-3 w-3" />{t("digiNeedPhone")}</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {k.registry?.gstin && (
              <div className="mt-5 rounded-2xl border border-line bg-surface p-4 text-sm">
                <div className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">{t("prefill")} · GST · {k.gstin_masked}</div>
                <div className="font-semibold">{k.registry.gstin.trade_name}</div>
                <div className="text-muted">{k.registry.gstin.legal_name} · {k.registry.gstin.constitution}</div>
                <div className="text-muted">{k.registry.gstin.address}</div>
                <div className="mt-2"><Status s={k.registry.gstin.status === "Active" ? "verified" : "needs_manual_review"} label={k.registry.gstin.status} /></div>
              </div>
            )}
            {k.registry_city && (
              <Notice tone="warn" className="mt-4">
                {code(k.checks.find((c: any) => c.code === "city.chat_differs"))}
                <button onClick={() => run("city", () => api("/api/kyc/use-registry-city", { method: "POST" }))}
                  className="mt-2 block font-semibold underline underline-offset-2">{t("useCity", { city: k.registry_city })}</button>
              </Notice>
            )}

            {k.demo_mode && (
              <details className="mt-5 rounded-2xl border border-dashed border-line-2 bg-surface p-4 text-sm">
                <summary className="flex cursor-pointer items-center gap-2 font-semibold"><FlaskConical className="h-4 w-4 text-brand" />{t("sampleTitle")}</summary>
                <p className="mt-2 text-muted">{t("sampleHint")}</p>
                <div className="mt-3 grid grid-cols-6 gap-2">
                  {SAMPLES.map((s) => (
                    <button key={s} disabled={!!busy} onClick={() => run("demo", () => api(`/api/kyc/demo/${s}`, { method: "POST" }))}
                      className="rounded-xl border border-line-2 bg-white py-2 font-mono text-sm font-semibold hover:border-brand hover:text-brand disabled:opacity-50">{s}</button>
                  ))}
                </div>
                {busy === "demo" && <p className="mt-2 flex items-center gap-2 text-muted"><Loader2 className="h-4 w-4 animate-spin" />{t("demoLoading")}</p>}
              </details>
            )}
          </Step>
          <ErrorNote error={err} />
        </div>

        <aside className="card p-6 lg:sticky lg:top-28">
          <h2 className="h2 mb-1">{t("resultTitle")}</h2>
          {k.consent && <p className="mb-4 text-xs font-semibold text-muted">{t("docsProgress", { done: required.length - missing.length, total: required.length })}</p>}
          <KycResult k={k} />
          <p className="mt-4 text-xs text-muted">{tc("brand.disclaimer")}</p>
          <Button className="mt-5 w-full" size="lg" href="/review" disabled={!k.can_submit}>
            {k.can_submit ? <>{t("toReview")}<ArrowRight className="h-4 w-4" /></> : t("toReviewLocked")}
          </Button>
        </aside>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return <RequireCustomer><Verify /></RequireCustomer>;
}
