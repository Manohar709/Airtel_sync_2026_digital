"use client";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { ArrowRight, Search } from "lucide-react";
import { api } from "@/lib/api";
import { inr } from "@/lib/format";
import { useApi } from "@/components/hooks";
import ProductCard from "@/components/ProductCard";
import { Button, ErrorNote, Notice, PageHeader, Skeleton, cn } from "@/components/ui";

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function Catalogue() {
  const t = useTranslations();
  const { data, error, reload } = useApi("/api/catalogue");
  const { data: app, reload: reloadApp } = useApi("/api/application");
  const [cat, setCat] = useState("All");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);

  const list = useMemo(() => (data?.products || []).filter((p: any) =>
    (cat === "All" || p.category === cat) && (!q || `${p.name} ${p.description}`.toLowerCase().includes(q.toLowerCase()))), [data, cat, q]);

  async function toggle(p: any) {
    if (!app) return;
    setBusy(p.product_id); setErr(null);
    const cart = app.cart as any[];
    const next = p.in_cart ? cart.filter((c) => c.product_id !== p.product_id) : [...cart, { product_id: p.product_id, quantity: p.default_quantity }];
    try { await api("/api/cart", { method: "PUT", body: next }); await Promise.all([reload(), reloadApp()]); }
    catch (e) { setErr(e); } finally { setBusy(null); }
  }

  const cats = ["All", ...Array.from(new Set<string>((data?.products || []).map((p: any) => p.category)))];
  return (
    <div className="container-x py-8">
      <PageHeader title={t("catalogue.title")} subtitle={t("catalogue.subtitle")}>
        <label className="relative w-full sm:w-72">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-subtle" aria-hidden />
          <input className="input pl-10" placeholder={t("catalogue.search")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("catalogue.search")} />
        </label>
      </PageHeader>
      {data && !data.profile_known && <Notice className="mb-6">{t("catalogue.profileHint")} <a href="/advisor" className="font-semibold underline underline-offset-2">{t("nav.advisor")}</a></Notice>}
      <div className="mb-6 flex gap-2 overflow-x-auto pb-1">
        {cats.map((c) => (
          <button key={c} onClick={() => setCat(c)} className={cn("shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition",
            cat === c ? "bg-ink text-white" : "bg-white text-ink-2 ring-1 ring-line hover:ring-ink-2/30")}>
            {t.has(`categories.${c}`) ? t(`categories.${c}`) : c}
          </button>
        ))}
      </div>
      <ErrorNote error={error || err} onRetry={error ? reload : undefined} />
      {!data ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-96" />)}</div> : (
        <motion.div layout className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((p: any) => (
            <motion.div layout key={p.product_id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <ProductCard p={p} names={data.names} status={data.profile_known ? p.status : undefined} checks={data.profile_known ? p.checks : undefined}
                inCart={p.in_cart} busy={busy === p.product_id} onToggle={() => toggle(p)} />
            </motion.div>
          ))}
        </motion.div>
      )}
      <AnimatePresence>
        {app?.quote && app.cart.length > 0 && (
          <motion.div initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }} className="fixed inset-x-0 bottom-4 z-30 px-4">
            <div className="mx-auto flex max-w-xl items-center justify-between gap-4 rounded-full bg-ink py-2.5 pl-6 pr-2.5 text-white shadow-[var(--shadow-lift)]">
              <span className="text-sm"><b className="tabular-nums">{inr(app.quote.monthly.mid)}</b><span className="text-white/60">{t("common.perMonth")} · {t("orders.items", { n: app.cart.length })}</span></span>
              <Button size="sm" href="/quote">{t("nav.quote")}<ArrowRight className="h-4 w-4" /></Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
