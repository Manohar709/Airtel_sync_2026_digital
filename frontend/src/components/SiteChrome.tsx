"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BriefcaseBusiness, Check, Headset, Lock, LogOut, Menu, Package, ShieldCheck, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { logout } from "@/lib/api";
import Logo from "./Logo";
import LanguageSwitcher from "./LanguageSwitcher";
import { useHelp } from "./HelpDialog";
import { useSession } from "./session";
import { Button, cn } from "./ui";

const LINKS = [
  { href: "/advisor", key: "advisor" },
  { href: "/plans", key: "plans" },
  { href: "/catalogue", key: "catalogue" },
] as const;

/** Slim dark bar above the header: audience, language and the staff entry point. */
function UtilityBar() {
  const t = useTranslations("nav");
  return (
    <div className="bg-night text-white/70">
      <div className="container-x flex h-9 items-center gap-4 text-xs">
        <span className="hidden items-center gap-1.5 font-semibold sm:inline-flex"><BriefcaseBusiness className="h-3.5 w-3.5 text-brand-100" />{t("forBusiness")}</span>
        <div className="ml-auto flex items-center gap-1">
          <LanguageSwitcher compact />
          <span className="mx-1 h-4 w-px bg-white/15" />
          <Link href="/employee/login" className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold text-white/80 hover:bg-white/10 hover:text-white">
            <Lock className="h-3 w-3" />{t("employee")}
          </Link>
        </div>
      </div>
    </div>
  );
}

export function SiteHeader() {
  const t = useTranslations("nav");
  const path = usePathname();
  const router = useRouter();
  const user = useSession();
  const { openHelp } = useHelp();
  const [open, setOpen] = useState(false);
  const signOut = () => { logout(); setOpen(false); router.push("/"); };
  // Highlight the current page only after mount, so server and browser render the same markup (no hydration mismatch).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const active = (href: string) => mounted && path.startsWith(href);

  return (
    <header className="sticky top-0 z-40">
      <UtilityBar />
      <div className="border-b border-line/80 bg-white/90 backdrop-blur-xl">
        <div className="container-x flex h-[68px] items-center gap-8">
          <Logo />
          <nav className="hidden items-center gap-1 lg:flex">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className={cn("relative rounded-full px-4 py-2 text-[15px] font-semibold transition",
                active(l.href) ? "text-ink" : "text-muted hover:text-ink")}>
                {t(l.key)}
                {active(l.href) && <motion.span layoutId="nav-dot" className="absolute inset-x-4 -bottom-[17px] h-[3px] rounded-full bg-brand" />}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <button onClick={openHelp} className="hidden h-10 items-center gap-2 rounded-full px-3.5 text-sm font-semibold text-ink-2 hover:bg-surface-2 sm:inline-flex">
              <Headset className="h-4 w-4 text-brand" aria-hidden />{t("help")}
            </button>
            {user ? (
              <div className="hidden items-center gap-1 md:flex">
                <Button variant="dark" size="sm" href="/orders"><Package className="h-4 w-4" aria-hidden />{t("orders")}</Button>
                <button onClick={signOut} aria-label={t("signOut")} title={t("signOut")} className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-surface-2"><LogOut className="h-4 w-4" /></button>
              </div>
            ) : user === null ? (
              <Button size="sm" href={`/account?next=${encodeURIComponent(path)}`} className="hidden md:inline-flex">{t("signIn")}</Button>
            ) : null}
            <button className="grid h-10 w-10 place-items-center rounded-full hover:bg-surface-2 lg:hidden" onClick={() => setOpen(!open)} aria-label={t("menu")} aria-expanded={open}>
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>
      <AnimatePresence>
        {open && (
          <motion.nav initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-line bg-white lg:hidden">
            <div className="container-x grid gap-1 py-3">
              {LINKS.map((l) => (
                <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className={cn("rounded-xl px-3 py-3 font-semibold", active(l.href) ? "bg-brand-50 text-brand-700" : "text-ink-2")}>{t(l.key)}</Link>
              ))}
              <button onClick={() => { setOpen(false); openHelp(); }} className="rounded-xl px-3 py-3 text-left font-semibold text-ink-2">{t("help")}</button>
              {user ? (
                <>
                  <Link href="/orders" onClick={() => setOpen(false)} className="rounded-xl px-3 py-3 font-semibold text-ink-2">{t("orders")}</Link>
                  <button onClick={signOut} className="rounded-xl px-3 py-3 text-left font-semibold text-ink-2">{t("signOut")}</button>
                </>
              ) : (
                <Link href="/account" onClick={() => setOpen(false)} className="rounded-xl px-3 py-3 font-semibold text-brand">{t("signIn")}</Link>
              )}
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}

export function SiteFooter() {
  const t = useTranslations();
  return (
    <footer className="mt-24 bg-night-gradient text-white/65">
      <div className="container-x grid gap-10 py-16 md:grid-cols-[1.5fr_1fr_1fr_1.3fr]">
        <div>
          <Logo tone="light" />
          <p className="mt-4 max-w-xs text-sm leading-relaxed">{t("brand.tagline")}</p>
        </div>
        <div className="grid content-start gap-2.5 text-sm">
          <div className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-white/40">{t("footer.journey")}</div>
          <Link href="/advisor" className="hover:text-white">{t("nav.advisor")}</Link>
          <Link href="/plans" className="hover:text-white">{t("nav.plans")}</Link>
          <Link href="/catalogue" className="hover:text-white">{t("nav.catalogue")}</Link>
          <Link href="/orders" className="hover:text-white">{t("nav.orders")}</Link>
        </div>
        <div className="grid content-start gap-2.5 text-sm">
          <div className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-white/40">{t("footer.support")}</div>
          <span>{t("nav.help")}</span>
          <span>{t("footer.languages")}</span>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-sm">
          <div className="mb-3 flex items-center gap-2 font-semibold text-white"><ShieldCheck className="h-4 w-4 text-brand-100" />{t("footer.privacyTitle")}</div>
          <ul className="space-y-1.5">
            {[1, 2, 3].map((n) => <li key={n} className="flex gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-100" />{t(`footer.privacy${n}`)}</li>)}
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <p className="container-x py-5 text-xs text-white/40">{t("brand.disclaimer")}</p>
      </div>
    </footer>
  );
}

const STEPS = [
  { key: "describe", href: "/advisor" },
  { key: "choose", href: "/plans" },
  { key: "quote", href: "/quote" },
  { key: "verify", href: "/verify" },
  { key: "submit", href: "/review" },
] as const;

/** Journey progress: Describe, Choose, Quote, Verify, Submit. */
export function Stepper({ current }: { current: (typeof STEPS)[number]["key"] }) {
  const t = useTranslations("steps");
  const idx = STEPS.findIndex((s) => s.key === current);
  return (
    <ol className="mb-8 flex items-center gap-1 overflow-x-auto pb-1 sm:gap-2" aria-label="Progress">
      {STEPS.map((s, i) => (
        <li key={s.key} className="flex shrink-0 items-center gap-1 sm:gap-2">
          <Link href={s.href} aria-current={i === idx ? "step" : undefined}
            className={cn("flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3.5 text-sm font-semibold transition",
              i === idx ? "bg-white text-ink shadow-[var(--shadow-card)] ring-1 ring-line" : i < idx ? "text-ink-2 hover:bg-white" : "text-subtle hover:bg-white")}>
            <span className={cn("grid h-6 w-6 place-items-center rounded-full text-xs font-bold",
              i === idx ? "bg-brand text-white" : i < idx ? "bg-ink text-white" : "border border-line-2 bg-white")}>
              {i < idx ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            {t(s.key)}
          </Link>
          {i < STEPS.length - 1 && <span className={cn("h-px w-4 sm:w-8", i < idx ? "bg-ink/40" : "bg-line-2")} />}
        </li>
      ))}
    </ol>
  );
}
