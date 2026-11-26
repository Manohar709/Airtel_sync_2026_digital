import Link from "next/link";

/** Product wordmark (an original swirl mark, deliberately not the Airtel logo). */
export function Mark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <span className={`relative grid shrink-0 place-items-center overflow-hidden rounded-[12px] bg-brand-gradient shadow-[var(--shadow-brand)] ${className}`}>
      <svg viewBox="0 0 24 24" className="h-[58%] w-[58%] text-white" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
        <path d="M4.5 15.5c3 0 3.5-7 7.5-7s4.5 7 7.5 7" />
        <path d="M4.5 9.8c3 0 3.5 5.4 7.5 5.4" opacity=".55" />
      </svg>
    </span>
  );
}

export default function Logo({ href = "/", tone = "dark", suffix }: { href?: string; tone?: "dark" | "light"; suffix?: string }) {
  const light = tone === "light";
  return (
    <Link href={href} className="group inline-flex items-center gap-2.5" aria-label="Airtel Vyapaar Connect home">
      <Mark />
      <span className="leading-none">
        <span className={`block font-display text-[11px] font-semibold uppercase tracking-[0.22em] ${light ? "text-white/55" : "text-brand"}`}>airtel</span>
        <span className={`block font-display text-[18px] font-bold tracking-[-0.02em] whitespace-nowrap ${light ? "text-white" : "text-ink"}`}>
          Vyapaar<span className={light ? "text-white/70" : "text-brand"}> Connect</span>{suffix && <span className={`ml-2 align-middle font-sans text-xs font-semibold tracking-normal ${light ? "text-white/55" : "text-muted"}`}>{suffix}</span>}
        </span>
      </span>
    </Link>
  );
}
