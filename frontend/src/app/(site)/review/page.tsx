"use client";
import { useState } from "react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Headset } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/components/hooks";
import { useHelp } from "@/components/HelpDialog";
import KycResult from "@/components/KycResult";
import QuoteSummary from "@/components/QuoteSummary";
import RequireCustomer from "@/components/RequireCustomer";
import { Stepper } from "@/components/SiteChrome";
import { Button, ErrorNote, Notice, PageHeader, Skeleton, Status } from "@/components/ui";

/* eslint-disable @typescript-eslint/no-explicit-any */
function Review() {
  const t = useTranslations("review");
  const tc = useTranslations();
  const { openHelp } = useHelp();
  const { data: app, error, reload } = useApi("/api/application");
  const { data: k } = useApi("/api/kyc");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [done, setDone] = useState<any>(null);

  async function submit() {
    setBusy(true); setErr(null);
    try { setDone(await api("/api/application/submit", { method: "POST" })); window.scrollTo({ top: 0, behavior: "smooth" }); }
    catch (e) { setErr(e); } finally { setBusy(false); }
  }

  if (done) return (
    <div className="container-x py-16">
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="card mx-auto max-w-xl p-10 text-center">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", delay: 0.1 }} className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-full bg-ok-bg text-ok">
          <CheckCircle2 className="h-9 w-9" />
        </motion.div>
        <h1 className="h1">{t("submitted")}</h1>
        <p className="mt-2 text-muted">{t("submittedBody")}</p>
        <div className="mt-2 text-sm font-semibold">{tc("orders.order", { id: done.id })}</div>
        <Button className="mt-6" href="/orders">{t("goOrders")}</Button>
      </motion.div>
    </div>
  );
  if (error && !app) return <div className="container-x py-10"><ErrorNote error={error} onRetry={reload} /></div>;
  if (!app || !k) return <div className="container-x py-10"><Skeleton className="h-96" /></div>;
  const r = app.requirements;
  if (!k.can_submit) return (
    <div className="container-x py-16">
      <div className="card mx-auto max-w-xl p-10 text-center">
        <h1 className="h1">{t("locked")}</h1>
        <p className="mt-2 text-muted">{t("lockedBody")}</p>
        <Button className="mt-6" href="/verify">{t("goVerify")}</Button>
      </div>
    </div>
  );

  return (
    <div className="container-x py-8">
      <Stepper current="submit" />
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <section className="card p-6">
            <h2 className="h2 mb-3">{t("business")}</h2>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              {(["business_type", "city", "employee_count", "num_sites"] as const).map((f) => (
                <div key={f} className="flex justify-between gap-3 border-b border-line py-1.5"><dt className="text-muted">{tc(`advisor.fields.${f}`)}</dt><dd className="font-semibold">{r[f] ?? "-"}</dd></div>
              ))}
              <div className="flex justify-between gap-3 border-b border-line py-1.5 sm:col-span-2"><dt className="text-muted">{tc("advisor.fields.needs")}</dt><dd className="text-right font-semibold">{r.needs.map((n: string) => tc(`needs.${n}`)).join(", ")}</dd></div>
            </dl>
          </section>
          <section className="card p-6">
            <h2 className="h2 mb-3">{t("plan")}</h2>
            <ul className="divide-y divide-line text-sm">
              {(app.quote?.items || []).map((i: any) => (
                <li key={i.product_id} className="flex justify-between gap-3 py-2.5"><span className="font-semibold">{i.name} <span className="font-normal text-muted">× {i.quantity}</span></span>{i.status !== "eligible" && <Status s={i.status} />}</li>
              ))}
            </ul>
          </section>
          <section className="card p-6">
            <h2 className="h2 mb-4">{t("verification")}</h2>
            <KycResult k={k} />
          </section>
        </div>
        <QuoteSummary quote={app.quote}>
          {k.verdict === "hold" && <Notice tone="info" className="mb-3">{t("verdictHold")}</Notice>}
          {k.verdict === "ask" && !app.help.requested && (
            <Notice tone="warn" className="mb-3">{t("helpHint")}
              <button onClick={openHelp} className="mt-2 flex items-center gap-1.5 font-semibold underline underline-offset-2"><Headset className="h-4 w-4" />{tc("nav.help")}</button>
            </Notice>
          )}
          {app.help.requested && <div className="mb-3 flex items-center justify-between text-sm"><span>{tc("help.statusLabel")}</span><Status s={app.help.status} /></div>}
          <ErrorNote error={err} />
          <Button className="mt-2 w-full" size="lg" loading={busy} disabled={!app.quote?.valid || !k.can_submit} onClick={submit}>{t("submit")}</Button>
        </QuoteSummary>
      </div>
    </div>
  );
}

export default function ReviewPage() {
  return <RequireCustomer><Review /></RequireCustomer>;
}
