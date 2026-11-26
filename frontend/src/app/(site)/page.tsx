"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { ArrowRight, Building2, CheckCircle2, ClipboardCheck, Factory, FileSearch, MessageSquareText,
  Mic, PackageCheck, Pill, Scissors, ShieldCheck, ShoppingBasket, Sparkles, Store, UtensilsCrossed, Wrench } from "lucide-react";
import { inr } from "@/lib/format";
import { useApi } from "@/components/hooks";
import ProductArt from "@/components/ProductArt";
import { Button, cn } from "@/components/ui";

/* eslint-disable @typescript-eslint/no-explicit-any */
const fade = { initial: { opacity: 0, y: 18 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-60px" }, transition: { duration: 0.5 } };
const TYPES = [
  ["for1", "Kirana store", ShoppingBasket], ["for2", "Pharmacy", Pill], ["for3", "Salon", Scissors],
  ["for4", "Office", Building2], ["for5", "Restaurant", UtensilsCrossed], ["for6", "Manufacturing unit", Factory],
] as const;
const CATS = ["Connectivity", "Communication", "Cloud & Productivity", "Security", "IoT & Physical"];

export default function Home() {
  const t = useTranslations("home");
  const tc = useTranslations();
  const router = useRouter();
  const [ask, setAsk] = useState("");
  const { data: cat } = useApi("/api/catalogue");
  const go = (text: string) => router.push(text.trim() ? `/advisor?say=${encodeURIComponent(text.trim())}` : "/advisor");
  const byCat = (c: string) => (cat?.products || []).filter((p: any) => p.category === c);

  return (
    <>
      {/* Hero: light and calm; red only as an accent */}
      <section className="relative overflow-hidden bg-[linear-gradient(180deg,#ffffff_0%,#fbf7f4_100%)]">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -right-32 -top-40 h-[680px] w-[680px] rounded-full bg-[radial-gradient(closest-side,rgb(228_0_0/0.13),transparent)]" />
          <div className="absolute -left-40 bottom-[-260px] h-[520px] w-[520px] rounded-full bg-[radial-gradient(closest-side,rgb(255_160_120/0.16),transparent)]" />
          <svg className="absolute -right-40 -top-24 hidden h-[760px] w-[760px] text-brand/[0.09] lg:block" viewBox="0 0 400 400" fill="none" stroke="currentColor">
            {[70, 120, 170, 220, 270, 320].map((r) => <circle key={r} cx="330" cy="70" r={r} strokeWidth="1" />)}
          </svg>
        </div>
        <div className="container-x relative grid items-center gap-14 pb-20 pt-14 lg:grid-cols-[1.1fr_1fr] lg:pb-24 lg:pt-20">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3.5 py-1.5 text-xs font-semibold text-brand-700 ring-1 ring-brand/15">
              <Sparkles className="h-3.5 w-3.5" />{t("eyebrow")}
            </span>
            <h1 className="mt-6 font-display text-[2.6rem] font-bold leading-[1.04] tracking-[-0.035em] text-ink sm:text-6xl lg:text-[4.1rem]">
              {t("titleA")} <span className="bg-gradient-to-r from-brand to-[#b3001b] bg-clip-text text-transparent">{t("titleB")}</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-muted sm:text-lg">{t("subtitle")}</p>

            <form onSubmit={(e) => { e.preventDefault(); go(ask); }}
              className="mt-8 flex max-w-xl items-center gap-2 rounded-full border border-line bg-white p-1.5 pl-5 shadow-[0_20px_50px_-24px_rgb(21_22_27/0.35)] focus-within:border-brand/40 focus-within:ring-4 focus-within:ring-brand/10">
              <MessageSquareText className="h-5 w-5 shrink-0 text-brand" aria-hidden />
              <input value={ask} onChange={(e) => setAsk(e.target.value)} placeholder={t("askPlaceholder")} aria-label={t("askPlaceholder")}
                className="min-w-0 flex-1 bg-transparent py-2.5 text-[15px] text-ink placeholder:text-subtle focus:outline-none" />
              <Link href="/advisor?voice=1" aria-label={t("ctaSpeak")} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-surface-2"><Mic className="h-5 w-5" /></Link>
              <button className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-brand px-5 text-sm font-semibold text-white shadow-[var(--shadow-brand)] transition hover:bg-brand-600">
                <span className="hidden sm:inline">{t("askGo")}</span><ArrowRight className="h-4 w-4" />
              </button>
            </form>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-subtle">{t("popular")}</span>
              {TYPES.slice(0, 3).map(([k, start]) => (
                <Link key={k} href={`/advisor?start=${encodeURIComponent(start)}`} className="rounded-full border border-line-2 bg-white px-3 py-1 font-semibold text-ink-2 transition hover:border-brand hover:text-brand">{t(k)}</Link>
              ))}
            </div>
          </motion.div>

          {/* Example of the experience (catalogue names and price ranges are real catalogue values) */}
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.15 }} className="relative mx-auto w-full max-w-md">
            <div aria-hidden className="absolute -inset-6 rounded-[40px] bg-brand-gradient opacity-[0.10] blur-2xl" />
            <div className="relative rounded-[28px] border border-line bg-white p-5 text-ink shadow-[0_40px_80px_-36px_rgb(21_22_27/0.45)]">
              <div className="mb-4 flex items-center gap-2 text-xs font-semibold text-muted"><span className="h-2 w-2 rounded-full bg-ok" />Vyapaar advisor</div>
              <div className="ml-auto w-[86%] rounded-2xl rounded-br-md bg-ink px-4 py-3 text-sm text-white">{t("demoUser")}</div>
              <div className="mt-3 w-[88%] rounded-2xl rounded-bl-md bg-surface px-4 py-3 text-sm text-ink-2">{t("demoBot")}</div>
              <div className="mt-4 overflow-hidden rounded-2xl border border-line">
                <div className="flex items-center justify-between bg-surface px-4 py-2.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-brand">{t("demoPlan")}</span>
                  <span className="rounded-full bg-ok-bg px-2 py-0.5 text-[11px] font-semibold text-ok">{t("demoEligible")}</span>
                </div>
                {[["P01", "Connectivity", "Biz Fibre 100", "₹999 – ₹1,199"], ["P19", "Cloud & Productivity", "Cloud POS & Billing", "₹599 – ₹899"]].map(([id, c, n, p]) => (
                  <div key={id} className="flex items-center gap-3 border-t border-line px-4 py-3 text-sm">
                    <ProductArt id={id} category={c} size="sm" />
                    <span className="flex-1 font-semibold">{n}</span><span className="tabular-nums text-muted">{p}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 text-[11px] text-subtle">{t("demoNote")}</div>
            </div>
            <div className="absolute -right-6 -top-6 hidden items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3 text-sm font-semibold text-ink shadow-[var(--shadow-lift)] sm:flex">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-ok-bg text-ok"><ShieldCheck className="h-5 w-5" /></span>
              <span><span className="block text-xs font-medium text-muted">KYC</span>{tc("verify.verdict_pass")}</span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Facts strip (from the catalogue and product scope) */}
      <section className="border-b border-line bg-white">
        <div className="container-x grid grid-cols-2 divide-line py-8 md:grid-cols-4 md:divide-x">
          {[["25", "stat1"], ["3", "stat2"], ["4", "stat3"], [t("stat4v"), "stat4"]].map(([v, k]) => (
            <div key={k} className="px-4 py-3 text-center">
              <div className="font-display text-3xl font-bold tracking-tight text-ink">{v}</div>
              <div className="mt-1 text-sm text-muted">{t(k)}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="container-x py-24">
        <motion.div {...fade} className="mb-12 max-w-2xl">
          <div className="eyebrow mb-3">{t("howEyebrow")}</div>
          <h2 className="font-display text-3xl font-bold tracking-[-0.03em] sm:text-[2.6rem] sm:leading-tight">{t("howTitle")}</h2>
        </motion.div>
        <div className="relative grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <div aria-hidden className="absolute left-[12%] right-[12%] top-8 hidden h-px bg-gradient-to-r from-brand/0 via-brand/40 to-brand/0 lg:block" />
          {[[MessageSquareText, 1], [PackageCheck, 2], [ClipboardCheck, 3], [Wrench, 4]].map(([Icon, n], i) => {
            const I = Icon as typeof Mic;
            return (
              <motion.div key={n as number} {...fade} transition={{ duration: 0.5, delay: i * 0.08 }} className="relative">
                <div className="relative z-10 grid h-16 w-16 place-items-center rounded-2xl bg-white text-brand shadow-[var(--shadow-card)] ring-1 ring-line"><I className="h-7 w-7" strokeWidth={1.8} /></div>
                <div className="mt-5 text-xs font-bold text-brand">0{n as number}</div>
                <div className="mt-1 font-display text-lg font-semibold">{t(`how${n}Title`)}</div>
                <p className="mt-2 text-sm leading-relaxed text-muted">{t(`how${n}Body`)}</p>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Services */}
      <section className="bg-white py-24">
        <div className="container-x">
          <motion.div {...fade} className="mb-12 flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-xl">
              <h2 className="font-display text-3xl font-bold tracking-[-0.03em] sm:text-[2.6rem] sm:leading-tight">{t("servicesTitle")}</h2>
              <p className="mt-3 text-muted">{t("servicesBody")}</p>
            </div>
            <Button variant="secondary" href="/catalogue">{t("seeAll")}<ArrowRight className="h-4 w-4" /></Button>
          </motion.div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {CATS.map((c, i) => {
              const items = byCat(c);
              const from = items.length ? Math.min(...items.map((p: any) => p.price_min)) : null;
              return (
                <motion.div key={c} {...fade} transition={{ duration: 0.5, delay: i * 0.06 }}
                  className="group flex flex-col rounded-[22px] border border-line bg-surface p-5 transition hover:-translate-y-1 hover:bg-white hover:shadow-[var(--shadow-lift)]">
                  <ProductArt category={c} size="lg" />
                  <div className="mt-4 font-display font-semibold">{tc.has(`categories.${c}`) ? tc(`categories.${c}`) : c}</div>
                  <ul className="mt-2 flex-1 space-y-1 text-sm text-muted">
                    {items.slice(0, 3).map((p: any) => <li key={p.product_id} className="truncate">{p.name}</li>)}
                  </ul>
                  {from != null && <div className="mt-4 text-sm font-semibold text-ink">{t("from", { price: inr(from) })}</div>}
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Smart KYC */}
      <section className="bg-night-gradient py-24 text-white">
        <div className="container-x grid items-center gap-14 lg:grid-cols-2">
          <motion.div {...fade}>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold"><FileSearch className="h-3.5 w-3.5" />Smart KYC</span>
            <h2 className="mt-5 font-display text-3xl font-bold tracking-[-0.03em] sm:text-[2.6rem] sm:leading-tight">{t("kycTitle")}</h2>
            <p className="mt-4 max-w-lg leading-relaxed text-white/70">{t("kycBody")}</p>
            <ul className="mt-7 space-y-3">
              {[1, 2, 3].map((n) => <li key={n} className="flex items-center gap-3 text-sm"><CheckCircle2 className="h-5 w-5 text-[#ff8a80]" />{t(`kycPoints${n}`)}</li>)}
            </ul>
          </motion.div>
          <motion.div {...fade} className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 backdrop-blur">
            <div className="mb-4 flex items-center gap-3 rounded-2xl bg-ok-bg p-4 text-ok">
              <ShieldCheck className="h-6 w-6" /><div><div className="font-bold">{tc("verify.verdict_pass")}</div><div className="text-sm opacity-80">{tc("verify.verdict_pass_body")}</div></div>
            </div>
            {[[CheckCircle2, "text-[#7ee2a8]", "kyc1"], [Sparkles, "text-[#ffb4a8]", "kyc2"], [Wrench, "text-[#ffd27a]", "kyc3"]].map(([Icon, tone, k]) => {
              const I = Icon as typeof Mic;
              return <div key={k as string} className="flex items-center gap-3 border-t border-white/10 py-3.5 text-sm text-white/85"><I className={cn("h-5 w-5 shrink-0", tone as string)} />{t(k as string)}</div>;
            })}
          </motion.div>
        </div>
      </section>

      {/* Built for */}
      <section className="container-x py-24">
        <motion.div {...fade} className="mb-10 max-w-xl">
          <h2 className="font-display text-3xl font-bold tracking-[-0.03em] sm:text-[2.6rem] sm:leading-tight">{t("forTitle")}</h2>
          <p className="mt-3 text-muted">{t("forBody")}</p>
        </motion.div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {TYPES.map(([k, start, Icon]) => (
            <Link key={k} href={`/advisor?start=${encodeURIComponent(start)}`}
              className="group flex items-center gap-4 rounded-[20px] border border-line bg-white p-5 transition hover:border-brand/40 hover:shadow-[var(--shadow-card)]">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand transition group-hover:bg-brand group-hover:text-white"><Icon className="h-6 w-6" strokeWidth={1.8} /></span>
              <span className="flex-1 font-semibold">{t(k)}</span>
              <ArrowRight className="h-4 w-4 text-brand opacity-0 transition group-hover:opacity-100" />
            </Link>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="container-x">
        <div className="relative overflow-hidden rounded-[32px] bg-brand-gradient px-6 py-14 text-white sm:px-14">
          <svg aria-hidden className="absolute -right-24 -top-24 h-96 w-96 opacity-15" viewBox="0 0 100 100" fill="none" stroke="white">
            {[20, 32, 44].map((r) => <circle key={r} cx="70" cy="30" r={r} strokeWidth=".6" />)}
          </svg>
          <div className="relative flex flex-wrap items-center justify-between gap-6">
            <div>
              <h2 className="font-display text-3xl font-bold tracking-[-0.03em] sm:text-4xl">{t("finalTitle")}</h2>
              <p className="mt-2 text-white/80">{t("finalBody")}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button size="lg" variant="light" href="/advisor">{t("ctaTalk")}<ArrowRight className="h-4 w-4" /></Button>
              <Button size="lg" variant="outlineLight" href="/catalogue"><Store className="h-4 w-4" />{t("ctaBrowse")}</Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
