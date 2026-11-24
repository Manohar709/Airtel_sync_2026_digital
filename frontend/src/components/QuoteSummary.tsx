"use client";
import { useTranslations } from "next-intl";
import { inr, inrRange } from "@/lib/format";
import { cn } from "./ui";

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Sticky quote summary: monthly range, setup, first-month total, midpoint estimate. All numbers from the backend. */
export default function QuoteSummary({ quote, children, className }: { quote: any; children?: React.ReactNode; className?: string }) {
  const t = useTranslations();
  if (!quote) return null;
  const Row = ({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) => (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className={cn("text-sm", strong ? "font-bold text-ink" : "text-muted")}>{label}</span>
      <span className="text-right">
        <span className={cn("block font-bold tabular-nums", strong ? "text-xl tracking-[-0.02em]" : "text-[15px]")}>{value}</span>
        {sub && <span className="block text-xs text-muted">{sub}</span>}
      </span>
    </div>
  );
  return (
    <aside className={cn("card overflow-hidden lg:sticky lg:top-24", className)}>
      <div className="bg-ink px-5 py-4 text-white">
        <div className="text-xs font-semibold uppercase tracking-widest text-white/60">{t("quote.summary")}</div>
        <div className="mt-1 text-3xl font-extrabold tracking-[-0.03em] tabular-nums">
          {inr(quote.monthly.mid)}<span className="text-base font-semibold text-white/60">{t("common.perMonth")}</span>
        </div>
        {quote.has_range && <div className="text-xs text-white/60">{t("common.estimate")} · {inrRange(quote.monthly.min, quote.monthly.max)}</div>}
      </div>
      <div className="divide-y divide-line px-5">
        <Row label={t("quote.recurring")} value={inrRange(quote.monthly.min, quote.monthly.max)} />
        <Row label={t("quote.setupTotal")} value={quote.setup_total ? inr(quote.setup_total) : t("common.noSetup")} />
        <Row strong label={t("quote.firstMonth")} value={inrRange(quote.first_month.min, quote.first_month.max)}
          sub={quote.has_range ? `${t("common.estimate")}: ${inr(quote.first_month.mid)}` : undefined} />
      </div>
      <div className="space-y-1 border-t border-line bg-surface px-5 py-3 text-xs text-muted">
        <p>{t("common.exclTax")}. {quote.has_range && t("common.estimateNote")}</p>
        {quote.max_contract_months > 0 && <p>{t("quote.contractNote", { n: quote.max_contract_months })}</p>}
        {quote.max_install_days > 0 && <p>{t("quote.installNote", { n: quote.max_install_days })}</p>}
        <p>{t("quote.feasibilityNote")}</p>
      </div>
      {children && <div className="border-t border-line p-5">{children}</div>}
    </aside>
  );
}
