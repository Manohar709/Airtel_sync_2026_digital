"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { ArrowRight, ChevronDown, Headset } from "lucide-react";
import { api } from "@/lib/api";
import { dateTime, inr, shortDate } from "@/lib/format";
import { useLocaleSwitch } from "@/i18n/I18nProvider";
import { useApi } from "@/components/hooks";
import { useHelp } from "@/components/HelpDialog";
import OrderTracker from "@/components/OrderTracker";
import RequireCustomer from "@/components/RequireCustomer";
import { Button, Empty, ErrorNote, PageHeader, Skeleton, Status, cn } from "@/components/ui";

/* eslint-disable @typescript-eslint/no-explicit-any */
function Timeline({ o, locale }: { o: any; locale: string }) {
  const t = useTranslations("orders");
  const tc = useTranslations();
  const [open, setOpen] = useState(false);
  const evText = (e: any) =>
    e.kind === "status" ? t("ev_status", { status: tc(`status.${e.status}`) })
      : e.kind === "help_status" ? t("ev_help_status", { status: tc(`status.${e.status}`) })
      : tc.has(`orders.ev_${e.kind}`) ? t(`ev_${e.kind}`) : e.kind;
  return (
    <div className="border-t border-line bg-surface px-6 py-4">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between text-xs font-bold uppercase tracking-wider text-muted">
        {t("history")} · {o.events.length}<ChevronDown className={cn("h-4 w-4 transition", open && "rotate-180")} />
      </button>
      {open && (
        <ol className="relative mt-3 space-y-3 border-l-2 border-line-2 pl-5">
          {[...o.events].reverse().map((e: any, k: number) => (
            <li key={k} className="relative text-sm">
              <span className={cn("absolute -left-[27px] top-1 h-3 w-3 rounded-full ring-4 ring-surface", k === 0 ? "bg-brand" : "bg-ink-2")} />
              <span className="font-semibold">{evText(e)}</span><span className="ml-2 text-xs text-muted">{dateTime(e.at, locale)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Orders() {
  const t = useTranslations("orders");
  const tc = useTranslations();
  const router = useRouter();
  const { openHelp } = useHelp();
  const { locale } = useLocaleSwitch();
  const { data, error, reload } = useApi("/api/orders");
  const [err, setErr] = useState<unknown>(null);

  async function resume(o: any) {
    try { await api(`/api/orders/${o.id}/resume`, { method: "POST" }); router.push(o.items.length ? "/quote" : "/advisor"); }
    catch (e) { setErr(e); }
  }

  if (error) return <div className="container-x py-10"><ErrorNote error={error} onRetry={reload} /></div>;
  const orders: any[] = data?.orders || [];
  const tracked = orders.filter((o) => o.tracking);
  const current = tracked.find((o) => !["live", "closed"].includes(o.status)) || tracked[0];
  const rest = orders.filter((o) => o !== current);

  return (
    <div className="container-x py-10">
      <PageHeader title={t("title")} subtitle={t("subtitle")}>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={openHelp}><Headset className="h-4 w-4" />{tc("nav.help")}</Button>
          <Button variant="secondary" href="/advisor">{t("newOrder")}</Button>
        </div>
      </PageHeader>
      <ErrorNote error={err} />
      {!data ? <Skeleton className="h-96" /> : orders.length === 0 ? (
        <Empty title={t("empty")} body={t("emptyBody")} action={<Button href="/advisor">{tc("home.ctaTalk")}</Button>} />
      ) : (
        <div className="space-y-6">
          {current && (
            <motion.article initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card overflow-hidden">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line p-6">
                <div>
                  <div className="flex items-center gap-3"><h2 className="text-xl font-extrabold">{t("order", { id: current.id })}</h2><Status s={current.status} /></div>
                  <p className="mt-1 text-sm text-muted">{[current.business_type, current.city].filter(Boolean).join(" · ")} · {shortDate(current.submitted_at || current.created_at, locale)}</p>
                </div>
                {current.monthly && <div className="text-right"><div className="text-2xl font-extrabold tabular-nums">{inr(current.monthly.mid)}<span className="text-sm font-semibold text-muted">{tc("common.perMonth")}</span></div><div className="text-xs text-muted">{tc("common.exclTax")}</div></div>}
              </div>
              <div className="p-6"><OrderTracker order={current} locale={locale} onChange={reload} /></div>
              <Timeline o={current} locale={locale} />
            </motion.article>
          )}
          {rest.length > 0 && (
            <section>
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted">{t("others")}</h3>
              <div className="grid gap-3 md:grid-cols-2">
                {rest.map((o) => (
                  <div key={o.id} className="card flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2"><span className="font-bold">{t("order", { id: o.id })}</span><Status s={o.status} /></div>
                      <div className="truncate text-sm text-muted">{o.items.map((x: any) => `${x.name} × ${x.quantity}`).join(", ") || [o.business_type, o.city].filter(Boolean).join(" · ")}</div>
                    </div>
                    {o.editable && <Button size="sm" onClick={() => resume(o)}>{t("resume")}<ArrowRight className="h-4 w-4" /></Button>}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

export default function OrdersPage() {
  return <RequireCustomer><Orders /></RequireCustomer>;
}
