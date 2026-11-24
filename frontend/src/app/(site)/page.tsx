"use client";
import Link from "next/link";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { ArrowRight, BadgeIndianRupee, FileCheck2, Headset, Layers, Mic, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui";

const fade = { initial: { opacity: 0, y: 18 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-60px" }, transition: { duration: 0.5 } };

export default function Home() {
  const t = useTranslations("home");
  const types = [
    ["for1", "Kirana store"], ["for2", "Pharmacy"], ["for3", "Salon"], ["for4", "Office"], ["for5", "Restaurant"], ["for6", "Manufacturing unit"],
  ] as const;
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-white">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -right-40 -top-40 h-[640px] w-[640px] rounded-full bg-[radial-gradient(closest-side,rgb(228_0_0/0.16),transparent)]" />
          <div className="absolute -left-32 bottom-[-220px] h-[520px] w-[520px] rounded-full bg-[radial-gradient(closest-side,rgb(228_0_0/0.07),transparent)]" />
          <svg className="absolute right-0 top-10 hidden h-[560px] w-[560px] text-brand/10 lg:block" viewBox="0 0 400 400" fill="none" stroke="currentColor">
            {[60, 110, 160, 210, 260].map((r) => <circle key={r} cx="400" cy="200" r={r} strokeWidth="1.5" />)}
          </svg>
        </div>
        <div className="container-x relative grid items-center gap-12 py-16 lg:grid-cols-[1.15fr_1fr] lg:py-24">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <div className="eyebrow mb-5">{t("eyebrow")}</div>
            <h1 className="h-display max-w-3xl">{t("title")}</h1>
            <p className="lead mt-6 max-w-xl">{t("subtitle")}</p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button size="lg" href="/advisor">{t("ctaTalk")}<ArrowRight className="h-4 w-4" /></Button>
              <Button size="lg" variant="secondary" href="/advisor?voice=1"><Mic className="h-4 w-4 text-brand" />{t("ctaSpeak")}</Button>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted">
              <span className="inline-flex items-center gap-2"><Sparkles className="h-4 w-4 text-brand" />{t("langNote")}</span>
              <Link href="/catalogue" className="font-semibold text-ink underline-offset-4 hover:underline">{t("ctaBrowse")}</Link>
            </div>
          </motion.div>

          {/* Illustrative example of the experience (catalogue names and prices are real catalogue values) */}
          <motion.div initial={{ opacity: 0, y: 30, rotate: 1.5 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ duration: 0.7, delay: 0.15 }}
            className="relative mx-auto w-full max-w-md">
            <div className="card relative overflow-hidden p-5 shadow-[var(--shadow-lift)]">
              <div className="mb-4 flex items-center gap-2 text-xs font-semibold text-muted"><span className="h-2 w-2 rounded-full bg-ok" />SYNC</div>
              <div className="ml-auto w-[85%] rounded-2xl rounded-br-md bg-ink px-4 py-3 text-sm text-white">{t("demoUser")}</div>
              <div className="mt-3 w-[88%] rounded-2xl rounded-bl-md bg-surface px-4 py-3 text-sm text-ink-2">{t("demoBot")}</div>
              <div className="mt-4 rounded-2xl border border-line p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-brand">{t("demoPlan")}</span>
                  <span className="rounded-full bg-ok-bg px-2 py-0.5 text-[11px] font-semibold text-ok">{t("demoEligible")}</span>
                </div>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="font-semibold">Biz Fibre 100</span><span className="tabular-nums text-muted">₹999 – ₹1,199</span></div>
                  <div className="flex justify-between"><span className="font-semibold">Cloud POS &amp; Billing</span><span className="tabular-nums text-muted">₹599 – ₹899</span></div>
                </div>
              </div>
              <div className="mt-3 text-[11px] text-subtle">{t("demoNote")}</div>
            </div>
            <div className="absolute -bottom-5 -left-5 hidden items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold shadow-[var(--shadow-lift)] sm:flex">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-brand text-white"><Mic className="h-4 w-4" /></span>
              <span className="flex h-5 items-center gap-[3px]">{[0, 1, 2, 3, 4].map((i) => <span key={i} className="h-full w-[3px] rounded-full bg-brand animate-wave" style={{ animationDelay: `${i * 0.12}s` }} />)}</span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* How it works */}
      <section className="container-x py-20">
        <motion.div {...fade} className="mb-10 max-w-xl">
          <div className="eyebrow mb-3">01 — 04</div>
          <h2 className="text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl">{t("howTitle")}</h2>
        </motion.div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((n, i) => (
            <motion.div key={n} {...fade} transition={{ duration: 0.5, delay: i * 0.08 }} className="card relative p-6">
              <div className="text-5xl font-extrabold tracking-[-0.05em] text-brand/15">0{n}</div>
              <div className="mt-3 text-lg font-bold">{t(`how${n}Title`)}</div>
              <p className="mt-2 text-sm text-muted">{t(`how${n}Body`)}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Built for */}
      <section className="bg-white py-20">
        <div className="container-x grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:items-center">
          <motion.h2 {...fade} className="text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl">{t("forTitle")}</motion.h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {types.map(([k, start]) => (
              <Link key={k} href={`/advisor?start=${encodeURIComponent(start)}`}
                className="group flex items-center justify-between rounded-2xl border border-line bg-surface px-4 py-4 font-semibold transition hover:border-brand hover:bg-brand-50">
                {t(k)}<ArrowRight className="h-4 w-4 -translate-x-1 text-brand opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Trust */}
      <section className="container-x py-20">
        <motion.h2 {...fade} className="mb-10 text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl">{t("trustTitle")}</motion.h2>
        <div className="grid gap-4 md:grid-cols-2">
          {[[BadgeIndianRupee, 1], [Layers, 2], [ShieldCheck, 3], [Headset, 4]].map(([Icon, n]) => {
            const I = Icon as typeof ShieldCheck;
            return (
              <motion.div key={n as number} {...fade} className="card flex gap-4 p-6">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand"><I className="h-5 w-5" /></span>
                <div><div className="font-bold">{t(`trust${n}Title`)}</div><p className="mt-1 text-sm text-muted">{t(`trust${n}Body`)}</p></div>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Final CTA */}
      <section className="container-x">
        <div className="relative overflow-hidden rounded-[28px] bg-brand px-6 py-14 text-white sm:px-12">
          <div aria-hidden className="absolute -right-24 -top-24 h-80 w-80 rounded-full border-[40px] border-white/10" />
          <div className="relative flex flex-wrap items-center justify-between gap-6">
            <div>
              <h2 className="text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl">{t("finalTitle")}</h2>
              <p className="mt-2 text-white/80">{t("finalBody")}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button size="lg" variant="dark" href="/advisor">{t("ctaTalk")}<ArrowRight className="h-4 w-4" /></Button>
              <Button size="lg" variant="secondary" href="/catalogue"><FileCheck2 className="h-4 w-4" />{t("ctaBrowse")}</Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
