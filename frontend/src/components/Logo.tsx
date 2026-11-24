import Link from "next/link";

/** Wordmark for the prototype (deliberately not the Airtel logo). */
export default function Logo({ href = "/", tone = "dark", suffix }: { href?: string; tone?: "dark" | "light"; suffix?: string }) {
  return (
    <Link href={href} className="group inline-flex items-center gap-2.5" aria-label="SYNC home">
      <span className="relative grid h-9 w-9 place-items-center overflow-hidden rounded-[11px] bg-brand shadow-[0_6px_16px_-6px_rgb(228_0_0/0.8)]">
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
          <path d="M5 15c2.5 0 3-6 7-6s4.5 6 7 6" />
          <path d="M5 9.5c2.5 0 3 5 7 5" opacity=".55" />
        </svg>
      </span>
      <span className={`text-[19px] font-extrabold tracking-[-0.03em] ${tone === "light" ? "text-white" : "text-ink"}`}>
        SYNC{suffix && <span className={`ml-2 align-middle text-xs font-semibold tracking-normal ${tone === "light" ? "text-white/60" : "text-muted"}`}>{suffix}</span>}
      </span>
    </Link>
  );
}
