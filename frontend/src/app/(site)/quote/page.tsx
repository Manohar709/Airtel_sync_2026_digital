"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { ArrowRight, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { inr, inrRange } from "@/lib/format";
import { useApi } from "@/components/hooks";
import { useCodeText } from "@/components/codes";
import { QtyStepper } from "@/components/ProductCard";
import QuoteSummary from "@/components/QuoteSummary";
import { Stepper } from "@/components/SiteChrome";
import { useSession } from "@/components/session";
import { Button, Empty, ErrorNote, Notice, PageHeader, Pill, Skeleton, Status } from "@/components/ui";

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function QuotePage() {
  const t = useTranslations();
  const router = useRouter();
  const user = useSession();
  const { data: app, setData: setApp, error, reload } = useApi("/api/application");
  const { data: cat } = useApi("/api/catalogue");
  const [err, setErr] = useState<unknown>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const names = cat?.names || {};
  const code = useCodeText(names);

  async function save(cart: any[], debounce = false) {
    setApp((a: any) => ({ ...a, cart }));
    const go = async () => {
      setErr(null);
      try { const r = await api("/api/cart", { method: "PUT", body: cart }); setApp((a: any) => ({ ...a, cart: r.cart, quote: r.quote })); }
      catch (e) { setErr(e); reload(); }
    };
    if (timer.current) clearTimeout(timer.current);
    if (debounce) timer.current = setTimeout(go, 350); else await go();
  }

  if (error && !app) return <div className="container-x py-10"><ErrorNote error={error} onRetry={reload} /></div>;
  if (!app) return <div className="container-x py-10"><Skeleton className="h-96" /></div>;
  const locked = !["draft", "awaiting_customer"].includes(app.status);
  const cart: any[] = app.cart;
  const quote = app.quote;

  function next() {
    if (!user) router.push("/account?next=/verify");
    else router.push("/verify");
  }

  return (
    <div className="container-x py-8">
      <Stepper current="quote" />
      <PageHeader title={t("quote.title")} subtitle={t("quote.subtitle")} />
      {cart.length === 0 ? (
        <Empty title={t("quote.empty")} body={t("quote.emptyBody")}
          action={<div className="flex gap-2"><Button href="/plans">{t("nav.plans")}</Button><Button variant="secondary" href="/catalogue">{t("nav.catalogue")}</Button></div>} />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-3">
            <ErrorNote error={err} />
            <AnimatePresence initial={false}>
              {(quote?.items || []).map((i: any) => {
                const p = cat?.products?.find((x: any) => x.product_id === i.product_id);
                return (
                  <motion.div key={i.product_id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -30 }}
                    className="card p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-[17px] font-bold">{i.name}</h3>
                          {i.status !== "eligible" && <Status s={i.status} />}
                        </div>
                        <div className="mt-0.5 text-sm text-muted">
                          {inrRange(i.unit_price_min, i.unit_price_max)} {t.has(`units.${i.unit}`) ? t(`units.${i.unit}`) : i.unit}{t("common.perMonth")} · {t("common.months", { n: i.contract_months })}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-extrabold tabular-nums">{inrRange(i.monthly_min, i.monthly_max)}</div>
                        <div className="text-xs text-muted">{i.is_range ? `${t("common.estimate")} ${inr(i.monthly_mid)}` : ""}{i.setup ? ` · ${t("common.setup")} ${inr(i.setup)}` : ""}</div>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                      <div className="flex items-center gap-3">
                        <QtyStepper value={i.quantity} disabled={locked} label={t("quote.quantity")}
                          onChange={(n) => save(cart.map((c) => (c.product_id === i.product_id ? { ...c, quantity: n } : c)), true)} />
                        <span className="text-xs text-muted">{t.has(`unitHint.${i.unit}`) ? t(`unitHint.${i.unit}`) : ""}</span>
                      </div>
                      {!locked && (
                        <button onClick={() => save(cart.filter((c) => c.product_id !== i.product_id))}
                          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-muted hover:bg-bad-bg hover:text-bad">
                          <Trash2 className="h-4 w-4" />{t("product.remove")}
                        </button>
                      )}
                    </div>
                    {p && i.status !== "eligible" && (
                      <ul className="mt-3 space-y-1 text-sm text-warn">
                        {i.checks.filter((c: any) => c.status === "missing" || c.status === "fail").map((c: any, k: number) => <li key={k}>• {code(c, c.detail)}</li>)}
                      </ul>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
            {quote && !quote.valid && (
              <Notice tone="warn" title={t("quote.invalid")}>
                <ul className="mt-1 space-y-1">
                  {quote.issue_items.map((it: any) => <li key={it.product_id}><b>{it.name}:</b> {it.reasons.map((r: any) => code(r)).join(" ")}</li>)}
                </ul>
              </Notice>
            )}
          </div>
          <QuoteSummary quote={quote}>
            <Button className="w-full" size="lg" disabled={!quote?.valid || locked} onClick={next}>
              {t("quote.continue")}<ArrowRight className="h-4 w-4" />
            </Button>
            {user === null && <p className="mt-2 text-center text-xs text-muted">{t("quote.signInToContinue")}</p>}
            {locked && <div className="mt-2 text-center"><Pill tone="info">{t(`status.${app.status}`)}</Pill></div>}
          </QuoteSummary>
        </div>
      )}
    </div>
  );
}
