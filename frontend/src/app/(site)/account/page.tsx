"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { ShieldCheck } from "lucide-react";
import { api, guestToken, setSession } from "@/lib/api";
import { useLocaleSwitch } from "@/i18n/I18nProvider";
import { Button, ErrorNote, Field, cn } from "@/components/ui";

function AccountInner() {
  const t = useTranslations("auth");
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/orders";
  const { locale } = useLocaleSwitch();
  const [tab, setTab] = useState<"signup" | "signin">(params.get("tab") === "signin" ? "signin" : "signup");
  const [f, setF] = useState({ name: "", email: "", phone: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const r = tab === "signup"
        ? await api("/api/auth/signup", { body: { ...f, guest_token: guestToken(), language: locale } })
        : await api("/api/auth/login", { body: { email: f.email, password: f.password, guest_token: guestToken() } });
      setSession("customer", r.token, r.user);
      router.replace(next.startsWith("/") ? next : "/orders");
    } catch (x) { setErr(x); } finally { setBusy(false); }
  }

  return (
    <div className="container-x grid min-h-[70vh] items-center gap-10 py-12 lg:grid-cols-2">
      <div className="max-w-md">
        <div className="eyebrow mb-3">Vyapaar Connect</div>
        <h1 className="h1">{t("title")}</h1>
        <p className="mt-3 text-muted">{t("subtitle")}</p>
        <div className="mt-6 flex items-center gap-3 rounded-2xl bg-white p-4 text-sm text-muted ring-1 ring-line">
          <ShieldCheck className="h-5 w-5 shrink-0 text-ok" />{useTranslations("home")("trust3Body")}
        </div>
      </div>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card w-full max-w-md p-6 sm:p-8 lg:justify-self-end">
        <div className="mb-6 grid grid-cols-2 rounded-full bg-surface p-1" role="tablist">
          {(["signup", "signin"] as const).map((k) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={cn("rounded-full py-2 text-sm font-semibold transition", tab === k ? "bg-white shadow-sm" : "text-muted")}>
              {k === "signup" ? t("signUpTab") : t("signInTab")}
            </button>
          ))}
        </div>
        <form className="space-y-4" onSubmit={submit}>
          {tab === "signup" && <Field label={t("name")}><input className="input" value={f.name} onChange={set("name")} autoComplete="name" required minLength={2} /></Field>}
          <Field label={t("email")}><input className="input" type="email" value={f.email} onChange={set("email")} autoComplete="email" required /></Field>
          {tab === "signup" && <Field label={t("phone")}><input className="input" value={f.phone} onChange={set("phone")} inputMode="tel" autoComplete="tel" required placeholder="98XXXXXXXX" /></Field>}
          <Field label={t("password")} hint={tab === "signup" ? t("passwordHint") : undefined}>
            <input className="input" type="password" value={f.password} onChange={set("password")} autoComplete={tab === "signup" ? "new-password" : "current-password"} required minLength={tab === "signup" ? 8 : 1} />
          </Field>
          <ErrorNote error={err} />
          <Button className="w-full" size="lg" loading={busy}>{tab === "signup" ? t("signUp") : t("signIn")}</Button>
        </form>
      </motion.div>
    </div>
  );
}

export default function AccountPage() {
  return <Suspense><AccountInner /></Suspense>;
}
