"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { ArrowRight, CalendarClock } from "lucide-react";
import { api } from "@/lib/api";
import { dateTime, inr, shortDate } from "@/lib/format";
import { useLocaleSwitch } from "@/i18n/I18nProvider";
import { useApi } from "@/components/hooks";
import RequireCustomer from "@/components/RequireCustomer";
import { Button, Empty, ErrorNote, PageHeader, Skeleton, Status, cn } from "@/components/ui";

/* eslint-disable @typescript-eslint/no-explicit-any */
function Orders() {
  const t = useTranslations("orders");
  const tc = useTranslations();
  const router = useRouter();
  const { locale } = useLocaleSwitch();
  const { data, error, reload } = useApi("/api/orders");
  const [err, setErr] = useState<unknown>(null);

  async function resume(o: any) {
    try { await api(`/api/orders/${o.id}/resume`, { method: "POST" }); router.push(o.items.length ? "/quote" : "/advisor"); }
    catch (e) { setErr(e); }
  }
  const evText = (e: any) =>
    e.kind === "status" ? t("ev_status", { status: tc(`status.${e.status}`) })
      : e.kind === "help_status" ? t("ev_help_status", { status: tc(`status.${e.status}`) })
      : tc.has(`orders.ev_${e.kind}`) ? t(`ev_${e.kind}`) : e.kind;

  if (error) return <div className="container-x py-10"><ErrorNote error={error} onRetry={reload} /></div>;
  return (
    <div className="container-x py-10">
      <PageHeader title={t("title")} subtitle={t("subtitle")}><Button variant="secondary" href="/advisor">{t("newOrder")}</Button></PageHeader>
      <ErrorNote error={err} />
      {!data ? <Skeleton className="h-64" /> : data.orders.length === 0 ? (
        <Empty title={t("empty")} body={t("emptyBody")} action={<Button href="/advisor">{tc("home.ctaTalk")}</Button>} />
      ) : (
        <div className="space-y-4">
          {data.orders.map((o: any, i: number) => (
            <motion.article key={o.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="card overflow-hidden">
              <div className="flex flex-wrap items-start justify-between gap-4 p-6">
                <div>
                  <div className="flex items-center gap-3"><h2 className="text-lg font-bold">{t("order", { id: o.id })}</h2><Status s={o.status} /></div>
                  <p className="mt-1 text-sm text-muted">{[o.business_type, o.city].filter(Boolean).join(" · ")} · {shortDate(o.created_at, locale)}</p>
                  {o.items.length > 0 && <p className="mt-2 text-sm">{o.items.map((x: any) => `${x.name} × ${x.quantity}`).join(", ")}</p>}
                </div>
                <div className="text-right">
                  {o.monthly && <div className="text-xl font-extrabold tabular-nums">{inr(o.monthly.mid)}<span className="text-sm font-semibold text-muted">{tc("common.perMonth")}</span></div>}
                  {o.help.requested && <div className="mt-1 text-xs"><span className="text-muted">{tc("help.statusLabel")}: </span><Status s={o.help.status} /></div>}
                </div>
              </div>
              {o.expected_activation && (
                <div className="flex items-center gap-2 border-t border-line bg-ok-bg/50 px-6 py-3 text-sm font-semibold text-ok">
                  <CalendarClock className="h-4 w-4" />{t("expected", { date: shortDate(o.expected_activation, locale) })}
                </div>
              )}
              <div className="border-t border-line bg-surface px-6 py-4">
                <div className="mb-3 text-xs font-bold uppercase tracking-wider text-muted">{t("timeline")}</div>
                <ol className="relative space-y-3 border-l-2 border-line-2 pl-5">
                  {o.events.map((e: any, k: number) => (
                    <li key={k} className="relative text-sm">
                      <span className={cn("absolute -left-[27px] top-1 h-3 w-3 rounded-full ring-4 ring-surface", k === o.events.length - 1 ? "bg-brand" : "bg-ink-2")} />
                      <span className="font-semibold">{evText(e)}</span><span className="ml-2 text-xs text-muted">{dateTime(e.at, locale)}</span>
                    </li>
                  ))}
                </ol>
                {o.editable && <Button className="mt-4" size="sm" onClick={() => resume(o)}>{t("resume")}<ArrowRight className="h-4 w-4" /></Button>}
              </div>
            </motion.article>
          ))}
        </div>
      )}
    </div>
  );
}

export default function OrdersPage() {
  return <RequireCustomer><Orders /></RequireCustomer>;
}
