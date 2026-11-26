"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { ArrowRight, Check, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { inr, inrRange } from "@/lib/format";
import { useApi } from "@/components/hooks";
import { useCodeText } from "@/components/codes";
import ProductCard from "@/components/ProductCard";
import ProductArt from "@/components/ProductArt";
import { Stepper } from "@/components/SiteChrome";
import { useHelp } from "@/components/HelpDialog";
import { Button, Empty, ErrorNote, Notice, PageHeader, Pill, Skeleton, cn } from "@/components/ui";

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function Plans() {
  const t = useTranslations("plans");
  const tc = useTranslations();
  const router = useRouter();
  const { openHelp } = useHelp();
  const { data: rec, error, loading, reload } = useApi("/api/recommendations");
  const [base, setBase] = useState<"recommended" | "basic">("recommended");
  const [addons, setAddons] = useState<string[]>([]);
  const [quote, setQuote] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const code = useCodeText(rec?.names || {});

  const startSet = useRef(false);
  useEffect(() => {  // until the profile is complete the plan starts from entry-level options
    if (rec?.start_tier && !startSet.current) { startSet.current = true; setBase(rec.start_tier); }
  }, [rec]);

  // every change saves the cart and returns the server-calculated quote
  useEffect(() => {
    if (!rec?.has_plan || rec.no_match) return;
    let live = true;
    setBusy(true);
    api("/api/cart/plan", { method: "POST", body: { base, addons } })
      .then((r) => live && (setQuote(r.quote), setErr(null))).catch((e) => live && setErr(e)).finally(() => live && setBusy(false));
    return () => { live = false; };
  }, [rec, base, addons]);

  if (loading && !rec) return <div className="container-x py-10"><Skeleton className="mb-6 h-10 w-64" /><Skeleton className="h-96" /></div>;
  if (error) return <div className="container-x py-10"><ErrorNote error={error} onRetry={reload} /></div>;
  if (!rec?.has_plan) return (
    <div className="container-x py-8"><Stepper current="choose" />
      <Empty title={t("title")} body={t("needAdvisor")} action={<Button href="/advisor">{t("goAdvisor")}</Button>} />
    </div>
  );

  const plan = rec.tiers?.[base];
  const budget = rec.tiers?.recommended && quote && plan?.within_budget != null;
  const toggle = (pid: string) => setAddons((a) => (a.includes(pid) ? a.filter((x) => x !== pid) : [...a, pid]));

  return (
    <div className="container-x py-8">
      <Stepper current="choose" />
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <ErrorNote error={err} />
      {rec.no_match && <Notice tone="warn" className="mb-6">{t("noMatch")}</Notice>}
      {!rec.ready && (
        <Notice tone="info" className="mb-6" title={t("startTitle")}>
          {rec.needs_source === "similar" ? tc("advisor.startSimilar") : tc("advisor.startStated")}{" "}
          {t("startMissing", { fields: (rec.missing || []).map((f: string) => tc(`advisor.fields.${f}`)).join(", ") })}
          <Link href="/advisor" className="mt-2 block font-semibold underline underline-offset-2">{t("fineTune")}</Link>
        </Notice>
      )}

      {!rec.no_match && plan && (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-6">
            <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 bg-ink px-6 py-5 text-white">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-white/60">{base === "basic" ? t("lowerOn") : t("standard")}</div>
                  <div className="text-xl font-extrabold">{t("includes")}</div>
                </div>
                {rec.has_lower_cost && (
                  <label className="flex cursor-pointer items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm font-semibold">
                    <input type="checkbox" className="accent-[var(--color-brand)]" checked={base === "basic"} onChange={(e) => setBase(e.target.checked ? "basic" : "recommended")} />
                    {t("lowerCost")}
                  </label>
                )}
              </div>
              <ul className="divide-y divide-line">
                {plan.cart.map((c: any) => {
                  const qi = quote?.items?.find((i: any) => i.product_id === c.product_id);
                  return (
                    <li key={c.product_id} className="flex items-start gap-3 px-6 py-4">
                      <ProductArt id={c.product_id} category={rec.products[c.product_id]?.category} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold">{rec.names[c.product_id]} <span className="font-normal text-muted">× {c.quantity}</span></div>
                        <div className="text-sm text-muted">{code(plan.reason_codes?.[c.product_id], plan.reasons[c.product_id])}</div>
                      </div>
                      {qi && <div className="text-right text-sm font-semibold tabular-nums">{inrRange(qi.monthly_min, qi.monthly_max)}<div className="text-xs font-normal text-muted">{tc("common.perMonth")}</div></div>}
                    </li>
                  );
                })}
              </ul>
            </motion.section>

            {rec.addons?.length > 0 && (
              <section className="card p-6">
                <h2 className="h2">{t("addonsTitle")}</h2>
                <p className="mb-4 text-sm text-muted">{t("addonsHint")}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {rec.addons.map((a: any) => {
                    const p = rec.products[a.product_id];
                    const on = addons.includes(a.product_id);
                    return (
                      <button key={a.product_id} onClick={() => toggle(a.product_id)} aria-pressed={on}
                        className={cn("flex items-start gap-3 rounded-2xl border p-4 text-left transition", on ? "border-brand bg-brand-50/60 ring-2 ring-brand/15" : "border-line-2 bg-white hover:border-ink-2/30")}>
                        <span className={cn("mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border-2", on ? "border-brand bg-brand text-white" : "border-line-2 text-subtle")}>
                          {on ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                        </span>
                        <ProductArt id={a.product_id} category={p?.category} size="sm" />
                        <span className="min-w-0">
                          <span className="block font-semibold">{p?.name}{a.quantity > 1 && <span className="font-normal text-muted"> × {a.quantity}</span>}</span>
                          <span className="block text-xs text-muted">{p?.description}</span>
                          {p && <span className="mt-1 block text-xs font-semibold text-ink-2">{t("perMonthAdd", { price: inrRange(p.price_min * a.quantity, p.price_max * a.quantity) })}</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            <details className="card p-6">
              <summary className="cursor-pointer font-bold">{t("whyEach")}</summary>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {Object.keys(plan.reasons).map((pid) => {
                  const qi = plan.quote.items.find((i: any) => i.product_id === pid);
                  return <ProductCard key={pid} p={rec.products[pid]} names={rec.names} status={qi?.status} checks={qi?.checks}
                    why={code(plan.reason_codes?.[pid], plan.reasons[pid])} />;
                })}
              </div>
            </details>
          </div>

          <aside className="card p-6 lg:sticky lg:top-24">
            <div className="text-xs font-bold uppercase tracking-wider text-muted">{t("monthlyEst")}</div>
            <div className={cn("mt-1 text-4xl font-extrabold tracking-[-0.03em] tabular-nums transition-opacity", busy && "opacity-50")}>
              {quote ? inr(quote.monthly.mid) : "…"}<span className="text-base font-semibold text-muted">{tc("common.perMonth")}</span>
            </div>
            {quote && <div className="mt-1 text-sm text-muted">{inrRange(quote.monthly.min, quote.monthly.max)} · {quote.setup_total ? `${tc("common.setup")} ${inr(quote.setup_total)}` : tc("common.noSetup")}</div>}
            {budget && addons.length === 0 && <div className="mt-3"><Pill tone={plan.within_budget ? "ok" : "warn"}>{plan.within_budget ? t("withinBudget") : t("overBudget")}</Pill></div>}
            <p className="mt-3 text-xs text-muted">{tc("common.exclTax")}. {tc("common.estimateNote")}</p>
            <Button className="mt-5 w-full" size="lg" disabled={!quote || busy} onClick={() => router.push("/quote")}>{t("continue")}<ArrowRight className="h-4 w-4" /></Button>
          </aside>
        </div>
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
