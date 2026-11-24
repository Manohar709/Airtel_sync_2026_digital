"use client";
import { useTranslations } from "next-intl";
import { Check, CircleDashed, Minus, Plus, X } from "lucide-react";
import { inr, inrRange } from "@/lib/format";
import { useCodeText } from "./codes";
import { useDescriptions } from "./hooks";
import { Button, Status, cn } from "./ui";

/* eslint-disable @typescript-eslint/no-explicit-any */
type P = any;

export function usePriceText() {
  const t = useTranslations();
  return (p: { unit: string; price_min: number; price_max: number }) =>
    `${inrRange(p.price_min, p.price_max)} ${t.has(`units.${p.unit}`) ? t(`units.${p.unit}`) : p.unit}${t("common.perMonth")}`;
}

const ICON = {
  ok: <Check className="h-3.5 w-3.5" />, fail: <X className="h-3.5 w-3.5" />,
  missing: <CircleDashed className="h-3.5 w-3.5" />, pending: <CircleDashed className="h-3.5 w-3.5" />,
};
const ICON_TONE: Record<string, string> = { ok: "bg-ok-bg text-ok", fail: "bg-bad-bg text-bad", missing: "bg-warn-bg text-warn", pending: "bg-surface-2 text-muted" };

/** Prerequisite checklist, always visible: what is met, what is missing, what we confirm later. */
export function Checklist({ checks, names, compact }: { checks: P[]; names: Record<string, string>; compact?: boolean }) {
  const code = useCodeText(names);
  return (
    <ul className={cn("space-y-1.5", compact && "text-[13px]")}>
      {checks.map((c: P, i: number) => (
        <li key={i} className="flex items-start gap-2">
          <span className={cn("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full", ICON_TONE[c.status])}>{ICON[c.status as keyof typeof ICON]}</span>
          <span className={c.status === "fail" ? "text-bad" : c.status === "missing" ? "text-warn" : "text-ink-2"}>{code(c, c.detail)}</span>
        </li>
      ))}
    </ul>
  );
}

export default function ProductCard({ p, names, status, checks, why, inCart, onToggle, busy, optional }: {
  p: P; names: Record<string, string>; status?: string; checks?: P[]; why?: string; inCart?: boolean;
  onToggle?: () => void; busy?: boolean; optional?: boolean;
}) {
  const t = useTranslations();
  const code = useCodeText(names);
  const price = usePriceText();
  const desc = useDescriptions();
  const description = desc?.descriptions?.[p.product_id] || p.description;
  return (
    <article className={cn("card flex flex-col p-5 transition hover:shadow-[var(--shadow-lift)]", inCart && "ring-2 ring-brand/70")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold text-muted">{t.has(`categories.${p.category}`) ? t(`categories.${p.category}`) : p.category}</div>
          <h3 className="mt-0.5 text-[17px] font-bold leading-snug tracking-[-0.01em]">{p.name}</h3>
        </div>
        {status && <Status s={status} />}
      </div>
      <p className="mt-2 text-sm text-muted">{description}</p>
      {why && <p className="mt-3 rounded-xl bg-brand-50 px-3 py-2 text-sm font-medium text-brand-900">{why}{optional && <span className="ml-1 text-brand-700">· {t("quote.optionalTag")}</span>}</p>}

      <div className="mt-4 flex items-baseline justify-between gap-2 border-t border-line pt-4">
        <div>
          <div className="text-lg font-extrabold tracking-[-0.02em]">{price(p)}</div>
          <div className="text-xs text-muted">
            {p.setup ? `${t("common.setup")} ${inr(p.setup)}` : t("common.noSetup")} · {t("common.months", { n: p.contract_months })} · {t("common.days", { n: p.install_days })}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl bg-surface p-3.5">
        <div className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-2">{t("product.requirements")}</div>
        {checks ? <Checklist checks={checks} names={names} compact /> : (
          <ul className="space-y-1 text-[13px] text-ink-2">
            {p.mandatory.map((m: P, i: number) => (
              <li key={i} className="flex gap-2"><span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                {code({ code: m.code, params: { ids: m.ids, n: m.n, tiers: m.tiers } }, m.text)}</li>
            ))}
          </ul>
        )}
        {(p.compatible_addons?.length > 0 || p.alternatives?.length > 0) && (
          <div className="mt-3 space-y-1 border-t border-line pt-2.5 text-xs text-muted">
            {p.compatible_addons?.length > 0 && <div><b className="text-ink-2">{t("product.worksWith")}:</b> {p.compatible_addons.map((i: string) => names[i] || i).join(", ")}</div>}
            {p.alternatives?.length > 0 && <div><b className="text-ink-2">{t("product.alternatives")}:</b> {p.alternatives.map((i: string) => names[i] || i).join(", ")}</div>}
          </div>
        )}
      </div>
      {desc?.translated && <div className="mt-2 text-[11px] text-subtle">{t("common.translated")}</div>}

      {onToggle && (
        <Button className="mt-4 w-full" variant={inCart ? "secondary" : status === "not_eligible" ? "secondary" : "primary"}
          disabled={busy || status === "not_eligible"} onClick={onToggle}>
          {status === "not_eligible" ? t("product.unavailable") : inCart ? <><Check className="h-4 w-4" />{t("product.inQuote")}</> : status === "prerequisite_required" ? t("product.addAnyway") : t("product.add")}
        </Button>
      )}
    </article>
  );
}

export function QtyStepper({ value, onChange, label, disabled }: { value: number; onChange: (n: number) => void; label: string; disabled?: boolean }) {
  const t = useTranslations("quote");
  return (
    <div className="inline-flex items-center rounded-full border border-line-2 bg-white" role="group" aria-label={label}>
      <button type="button" disabled={disabled || value <= 1} onClick={() => onChange(value - 1)} aria-label={t("decrease")}
        className="grid h-9 w-9 place-items-center rounded-full text-ink hover:bg-surface disabled:opacity-30"><Minus className="h-4 w-4" /></button>
      <input type="number" inputMode="numeric" min={1} max={500} value={value} disabled={disabled} aria-label={label}
        onChange={(e) => onChange(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
        className="h-9 w-12 bg-transparent text-center text-sm font-bold [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none" />
      <button type="button" disabled={disabled || value >= 500} onClick={() => onChange(value + 1)} aria-label={t("increase")}
        className="grid h-9 w-9 place-items-center rounded-full text-ink hover:bg-surface disabled:opacity-30"><Plus className="h-4 w-4" /></button>
    </div>
  );
}
