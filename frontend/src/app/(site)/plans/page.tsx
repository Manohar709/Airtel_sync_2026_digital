"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { Check, Minus } from "lucide-react";
import { api } from "@/lib/api";
import { inr, inrRange } from "@/lib/format";
import { useApi } from "@/components/hooks";
import { useCodeText } from "@/components/codes";
import ProductCard from "@/components/ProductCard";
import { Stepper } from "@/components/SiteChrome";
import { useHelp } from "@/components/HelpDialog";
import { Button, Empty, ErrorNote, Notice, PageHeader, Pill, Skeleton, cn } from "@/components/ui";

/* eslint-disable @typescript-eslint/no-explicit-any */
const TIERS = ["basic", "recommended", "advanced"] as const;

export default function Plans() {
  const t = useTranslations("plans");
  const tc = useTranslations();
  const router = useRouter();
  const { openHelp } = useHelp();
  const { data: rec, error, loading, reload } = useApi("/api/recommendations");
  const [view, setView] = useState<(typeof TIERS)[number]>("recommended");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const code = useCodeText(rec?.names || {});

  async function choose(tier: string) {
    setBusy(tier); setErr(null);
    try { await api(`/api/cart/tier/${tier}`, { method: "POST" }); router.push("/quote"); }
    catch (e) { setErr(e); setBusy(null); }
  }

  if (loading && !rec) return <div className="container-x py-10"><Skeleton className="mb-6 h-10 w-64" /><div className="grid gap-4 md:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-80" />)}</div></div>;
  if (error) return <div className="container-x py-10"><ErrorNote error={error} onRetry={reload} /></div>;
  if (!rec?.ready) return (
    <div className="container-x py-8"><Stepper current="choose" />
      <Empty title={t("title")} body={t("needAdvisor")} action={<Button href="/advisor">{t("goAdvisor")}</Button>} />
    </div>
  );

  const tiers = rec.tiers;
  const allIds: string[] = Array.from(new Set(TIERS.flatMap((k) => tiers[k]?.cart.map((c: any) => c.product_id) || [])));
  const v = tiers[view];

  return (
    <div className="container-x py-8">
      <Stepper current="choose" />
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <ErrorNote error={err} />
      {rec.no_match && <Notice tone="warn" className="mb-6">{t("noMatch")}</Notice>}

      {!rec.no_match && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            {TIERS.map((k, i) => {
              const tq = tiers[k];
              const best = k === "recommended";
              return (
                <motion.div key={k} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                  className={cn("card relative flex flex-col p-6", best && "border-ink bg-ink text-white md:-translate-y-2 md:shadow-[var(--shadow-lift)]")}>
                  {best && <span className="absolute -top-3 left-6 rounded-full bg-brand px-3 py-1 text-xs font-bold text-white">{t("bestFit")}</span>}
                  <div className="text-lg font-extrabold">{t(k)}</div>
                  <p className={cn("text-sm", best ? "text-white/60" : "text-muted")}>{t(`${k}Desc`)}</p>
                  <div className="mt-5">
                    <div className="text-4xl font-extrabold tracking-[-0.03em] tabular-nums">{inr(tq.quote.monthly.mid)}<span className={cn("text-base font-semibold", best ? "text-white/60" : "text-muted")}>{tc("common.perMonth")}</span></div>
                    <div className={cn("text-xs", best ? "text-white/60" : "text-muted")}>{t("monthlyEst")} · {inrRange(tq.quote.monthly.min, tq.quote.monthly.max)} · {tq.quote.setup_total ? `${tc("common.setup")} ${inr(tq.quote.setup_total)}` : tc("common.noSetup")}</div>
                  </div>
                  {tq.within_budget != null && (
                    <div className="mt-3"><Pill tone={tq.within_budget ? "ok" : "warn"}>{tq.within_budget ? t("withinBudget") : t("overBudget")}</Pill></div>
                  )}
                  <div className={cn("mt-5 text-xs font-bold uppercase tracking-wider", best ? "text-white/60" : "text-ink-2")}>{t("includes")}</div>
                  <ul className="mt-2 flex-1 space-y-2 text-sm">
                    {tq.cart.map((c: any) => (
                      <li key={c.product_id} className="flex items-start gap-2">
                        <Check className={cn("mt-0.5 h-4 w-4 shrink-0", best ? "text-brand-100" : "text-brand")} />
                        <span><b>{rec.names[c.product_id]}</b> × {c.quantity}{tq.optional?.includes(c.product_id) && <span className={best ? "text-white/50" : "text-muted"}> · {tc("quote.optionalTag")}</span>}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-6 grid gap-2">
                    <Button variant={best ? "primary" : "secondary"} loading={busy === k} onClick={() => choose(k)}>{t("choose", { tier: t(k) })}</Button>
                    <button onClick={() => setView(k)} className={cn("text-sm font-semibold underline-offset-4 hover:underline", best ? "text-white/70" : "text-muted")}>{t("whyThis")}</button>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Comparison table */}
          <section className="mt-12">
            <h2 className="h2 mb-4">{t("compareTitle")}</h2>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left">
                    <th className="p-4 font-semibold text-muted" />
                    {TIERS.map((k) => <th key={k} className={cn("p-4 text-center font-bold", k === "recommended" && "text-brand")}>{t(k)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {allIds.map((pid) => (
                    <tr key={pid} className="border-b border-line last:border-0">
                      <td className="p-4"><div className="font-semibold">{rec.names[pid]}</div><div className="text-xs text-muted">{tc.has(`categories.${rec.products[pid]?.category}`) ? tc(`categories.${rec.products[pid]?.category}`) : ""}</div></td>
                      {TIERS.map((k) => {
                        const c = tiers[k].cart.find((x: any) => x.product_id === pid);
                        return <td key={k} className="p-4 text-center">{c ? <span className="inline-flex items-center gap-1 font-semibold"><Check className="h-4 w-4 text-ok" />× {c.quantity}</span> : <Minus className="mx-auto h-4 w-4 text-line-2" />}</td>;
                      })}
                    </tr>
                  ))}
                  <tr className="bg-surface">
                    <td className="p-4 font-bold">{t("monthlyEst")}</td>
                    {TIERS.map((k) => <td key={k} className="p-4 text-center font-extrabold tabular-nums">{inr(tiers[k].quote.monthly.mid)}</td>)}
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted">{tc("common.exclTax")}. {tc("common.estimateNote")}</p>
          </section>

          {/* Detail of one tier */}
          <section className="mt-12">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <h2 className="h2 mr-3">{t("whyThis")}</h2>
              {TIERS.map((k) => (
                <button key={k} onClick={() => setView(k)} className={cn("rounded-full px-4 py-1.5 text-sm font-semibold transition",
                  view === k ? "bg-ink text-white" : "bg-white text-ink-2 ring-1 ring-line hover:ring-ink-2/30")}>{t(k)}</button>
              ))}
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Object.keys(v.reasons).map((pid) => {
                const qi = v.quote.items.find((i: any) => i.product_id === pid);
                return <ProductCard key={pid} p={rec.products[pid]} names={rec.names} status={qi?.status} checks={qi?.checks}
                  why={code(v.reason_codes?.[pid], v.reasons[pid])} optional={v.optional?.includes(pid)} />;
              })}
            </div>
            {rec.items.filter((i: any) => i.cheaper_eligible_alternatives.length).map((i: any) => (
              <p key={i.product_id} className="mt-3 text-sm text-muted">{t("cheaper", { names: i.cheaper_eligible_alternatives.map((x: string) => rec.names[x]).join(", ") })}</p>
            ))}
          </section>
        </>
      )}

      {rec.unmet_needs?.map((u: any) => (
        <Notice key={u.need} tone="warn" className="mt-6" title={t("unmetTitle", { need: tc(`needs.${u.need}`) })}>
          <ul className="mt-1 list-disc pl-5">{(u.reason_codes || []).map((rc: any, i: number) => <li key={i}>{code(rc)}</li>)}</ul>
          <button onClick={openHelp} className="mt-2 font-semibold underline underline-offset-2">{t("unmetNext")}</button>
        </Notice>
      ))}
    </div>
  );
}
