"use client";
import { useTranslations } from "next-intl";
import { ArrowRight, Check, Circle } from "lucide-react";
import { inr, inrRange } from "@/lib/format";
import ProductArt from "./ProductArt";
import { Button, cn } from "./ui";

/* eslint-disable @typescript-eslint/no-explicit-any */
const DETAILS = ["business_type", "city", "employee_count", "num_sites", "needs"] as const;

/** The advisor's bundle message: what we recommend now, the price, and which details would tailor it further. */
export default function BundleCard({ app, rec, plan }: { app: any; rec: any; plan: any }) {
  const t = useTranslations("advisor");
  const tc = useTranslations();
  const r = app.requirements || {};
  const known = (f: string) => (f === "needs" ? r.needs?.length > 0 : r[f] != null && r[f] !== "");
  const done = DETAILS.filter(known).length;
  const facts = [r.business_type, r.city, r.employee_count && t("factPeople", { n: r.employee_count }),
    r.num_sites && t("factSites", { n: r.num_sites })].filter(Boolean);
  const q = plan.quote;

  return (
    <div className="overflow-hidden rounded-[22px] border border-line bg-white shadow-[var(--shadow-card)]">
      <div className="bg-brand-gradient px-5 py-4 text-white">
        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/70">{app.ready ? t("bundleReady") : t("bundleTitle")}</div>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-2">
          <div className="font-display text-[28px] font-bold leading-none tabular-nums">{inr(q.monthly.mid)}<span className="text-sm font-semibold text-white/75">{tc("common.perMonth")}</span></div>
          <div className="text-right text-xs text-white/75">{tc("common.exclTax")}{q.setup_total ? ` · ${tc("common.setup")} ${inr(q.setup_total)}` : ""}</div>
        </div>
        {facts.length > 0 && <div className="mt-2 text-xs text-white/80">{t("basedOn")} {facts.join(" · ")}</div>}
      </div>

      <ul className="divide-y divide-line">
        {q.items.map((i: any) => (
          <li key={i.product_id} className="flex items-center gap-3 px-5 py-3">
            <ProductArt id={i.product_id} category={rec.products?.[i.product_id]?.category} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{i.name}{i.quantity > 1 && <span className="font-normal text-muted"> × {i.quantity}</span>}</div>
              {plan.reason_codes?.[i.product_id]?.params?.need && (
                <div className="truncate text-xs text-muted">{tc.has(`needs.${plan.reason_codes[i.product_id].params.need}`) ? tc(`needs.${plan.reason_codes[i.product_id].params.need}`) : ""}</div>
              )}
            </div>
            <div className="shrink-0 text-right text-sm font-semibold tabular-nums">{inrRange(i.monthly_min, i.monthly_max)}</div>
          </li>
        ))}
      </ul>

      {!app.ready && (
        <div className="border-t border-line bg-surface px-5 py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-bold">{t("tailorTitle")}</div>
            <div className="text-xs font-semibold text-muted">{t("sharedCount", { done, total: DETAILS.length })}</div>
          </div>
          <p className="mt-1 text-xs text-muted">{t("tailorBody")}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {DETAILS.map((f) => (
              <span key={f} className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
                known(f) ? "bg-ok-bg text-ok" : "border border-dashed border-line-2 bg-white text-muted")}>
                {known(f) ? <Check className="h-3 w-3" /> : <Circle className="h-3 w-3" />}{t(`fields.${f}`)}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
        <span className="text-xs text-muted">{rec.needs_source === "similar" ? t("startSimilar") : t("startStated")}</span>
        <Button size="sm" href="/plans">{t("viewPlan")}<ArrowRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}
