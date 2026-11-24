"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X, Loader2, AlertCircle, CheckCircle2, Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { ApiError } from "@/lib/api";

export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type BtnProps = {
  variant?: "primary" | "secondary" | "ghost" | "dark" | "link";
  size?: "sm" | "md" | "lg";
  href?: string;
  loading?: boolean;
  className?: string;
  children: React.ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">;

const VARIANTS = {
  primary: "bg-brand text-white hover:bg-brand-600 active:bg-brand-700 shadow-[0_8px_20px_-10px_rgb(228_0_0/0.7)]",
  secondary: "bg-white text-ink border border-line-2 hover:border-ink-2/40 hover:bg-surface",
  ghost: "text-ink-2 hover:bg-surface-2",
  dark: "bg-ink text-white hover:bg-ink-2",
  link: "text-brand hover:text-brand-700 underline-offset-4 hover:underline !px-0 !h-auto",
};
const SIZES = { sm: "h-9 px-3.5 text-sm", md: "h-11 px-5 text-[15px]", lg: "h-13 px-7 text-base" };

export function Button({ variant = "primary", size = "md", href, loading, className, children, disabled, ...rest }: BtnProps) {
  const cls = cn("inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all duration-150",
    "disabled:cursor-not-allowed disabled:opacity-50 select-none", VARIANTS[variant], SIZES[size], className);
  if (href && !disabled) return <Link href={href} className={cls}>{children}</Link>;
  return (
    <button className={cls} disabled={disabled || loading} {...rest}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

const TONE: Record<string, string> = {
  ok: "bg-ok-bg text-ok", bad: "bg-bad-bg text-bad", warn: "bg-warn-bg text-warn", info: "bg-info-bg text-info",
  neutral: "bg-surface-2 text-ink-2", brand: "bg-brand-50 text-brand-700",
};
export const STATUS_TONE: Record<string, keyof typeof TONE> = {
  verified: "ok", ok: "ok", eligible: "ok", ready_for_activation: "ok", resolved: "ok",
  action_required: "bad", fail: "bad", not_eligible: "bad",
  needs_manual_review: "warn", prerequisite_required: "warn", missing: "warn", awaiting_customer: "warn", open: "brand",
  pending: "neutral", unable_to_verify: "neutral", draft: "neutral", closed: "neutral",
  submitted: "info", in_review: "info", in_progress: "info",
};

export function Pill({ tone = "neutral", children, className }: { tone?: keyof typeof TONE; children: React.ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold leading-none", TONE[tone], className)}>{children}</span>;
}

/** Localised status pill for any backend status value. */
export function Status({ s, label }: { s: string; label?: string }) {
  const t = useTranslations("status");
  const tone = STATUS_TONE[s] || "neutral";
  return (
    <Pill tone={tone}>
      <span className={cn("h-1.5 w-1.5 rounded-full", { ok: "bg-ok", bad: "bg-bad", warn: "bg-warn", info: "bg-info", neutral: "bg-subtle", brand: "bg-brand" }[tone])} />
      {label ?? (t.has(s) ? t(s) : s)}
    </Pill>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-surface-2", className)} />;
}

export function Notice({ tone = "info", title, children, className }: { tone?: "info" | "bad" | "warn" | "ok"; title?: string; children?: React.ReactNode; className?: string }) {
  const Icon = tone === "ok" ? CheckCircle2 : tone === "info" ? Info : AlertCircle;
  return (
    <div role={tone === "bad" ? "alert" : "status"} className={cn("flex gap-3 rounded-2xl px-4 py-3 text-sm", TONE[tone], className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>{title && <div className="font-semibold">{title}</div>}{children}</div>
    </div>
  );
}

export function useErrorText() {
  const t = useTranslations("common");
  return (e: unknown) => (e instanceof ApiError && e.status === 0) || (e instanceof Error && e.message === "offline")
    ? t("offline") : e instanceof Error && e.message ? e.message : t("error");
}

export function ErrorNote({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = useErrorText();
  const t = useTranslations("common");
  if (!error) return null;
  return (
    <Notice tone="bad">
      {msg(error)}
      {onRetry && <button onClick={onRetry} className="ml-2 font-semibold underline underline-offset-2">{t("retry")}</button>}
    </Notice>
  );
}

export function Dialog({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const t = useTranslations("nav");
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    setTimeout(() => ref.current?.querySelector<HTMLElement>("input,textarea,button")?.focus(), 50);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; prev?.focus?.(); };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]" onClick={onClose} />
          <motion.div ref={ref} role="dialog" aria-modal="true" aria-label={title}
            className={cn("relative w-full rounded-t-3xl bg-white p-6 shadow-[var(--shadow-lift)] sm:rounded-3xl", wide ? "sm:max-w-2xl" : "sm:max-w-md")}
            initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }} transition={{ type: "spring", damping: 28, stiffness: 320 }}>
            <div className="mb-4 flex items-start justify-between gap-4">
              <h2 className="h2">{title}</h2>
              <button onClick={onClose} aria-label={t("close")} className="-m-2 rounded-full p-2 text-muted hover:bg-surface"><X className="h-5 w-5" /></button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function PageHeader({ eyebrow, title, subtitle, children }: { eyebrow?: string; title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-8">
      <div className="max-w-2xl">
        {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
        <h1 className="h1">{title}</h1>
        {subtitle && <p className="mt-2 text-muted">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 h-12 w-12 rounded-2xl bg-brand-50 ring-8 ring-brand-50/50" />
      <div className="h2">{title}</div>
      {body && <p className="mt-1 max-w-sm text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
