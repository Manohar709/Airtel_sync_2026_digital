"use client";
import { CheckCircle2, CircleAlert, Clock3, Lock, Plus, Search, ShieldCheck, SquareCheckBig, Trash2, Users } from "lucide-react";
import { Mark } from "@/components/Logo";

const PRINCIPLES = [
  { icon: SquareCheckBig, title: "Consent first", body: "No document or identity data is collected until the customer agrees, with the time recorded." },
  { icon: Search, title: "Only what's needed", body: "GST certificate only for GST products. No-GST shops verify with ID or DigiLocker and a bill." },
  { icon: Lock, title: "Documents never reach AI", body: "Photos are read by OCR on our own server. The AI sees redacted chat text only." },
  { icon: Trash2, title: "Deleted after use", body: "Uploaded documents are removed automatically after 7 days (configurable)." },
];
const STEPS = [
  ["Advisor chat", "Business type, city, team size, locations, needs", "Recommend an eligible plan and price",
    "Phone, email, GSTIN, PAN, Aadhaar & Udyam numbers are redacted before any text reaches the AI; only the last 8 turns are sent"],
  ["Sign up", "Name, email, mobile, password", "Account and order updates", "Password stored only as a bcrypt hash; signed session tokens"],
  ["Verify", "Mobile OTP; photos of GST / Udyam certificate, ID, electricity bill", "Business verification before activation",
    "Consent first; read on our server; numbers masked on screen, e.g. 27••••••••••1ZP"],
  ["DigiLocker", "Name and last 4 Aadhaar digits", "Identity without an ID photo", "The full Aadhaar number is never asked for or stored"],
  ["Order", "Chosen UPI app, e-sign time", "Sign the order and set up AutoPay", "No card or bank account numbers are collected"],
];
const WHO = [
  ["Customer", "Only their own application, documents and orders; ownership is checked on every request."],
  ["Staff", "One authorised account. Identifiers masked; documents visible only after submission or a help request."],
  ["AI assistant", "Redacted chat text only. Never documents or images, and it cannot approve, price or decide eligibility."],
];
const KEEP = [
  ["Documents", "Deleted automatically after 7 days"],
  ["OTP codes", "Stored hashed; expire in 10 minutes; 5 attempts"],
  ["Order data", "Kept only to deliver and support the service"],
];
const CONTROLS = ["Withdraw consent at any time; checks stop", "Replace or delete any uploaded document", "\"Talk to a person\" on every page",
  "Rate limits on sign-in, OTP, uploads and help requests", "Secrets kept in server configuration, never in code"];
const LAUNCH = ["Encrypt stored documents and identifiers at rest", "Connect real SMS, DigiLocker / UIDAI, GST and NPCI services (simulated here)",
  "India-hosted AI model; consent ledger and audit log", "Data Protection Officer and breach-response process under the DPDP Rules"];

function BoxTitle({ icon: Icon, children }: { icon: typeof Lock; children: React.ReactNode }) {
  return (
    <h3 className="flex items-center gap-2.5 font-display text-lg font-semibold">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand"><Icon className="h-[18px] w-[18px]" /></span>{children}
    </h3>
  );
}

/** Staff-facing summary of how customer data is collected, protected and deleted (DPDP Act, 2023). */
export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <section className="relative overflow-hidden rounded-[28px] bg-brand-gradient px-8 pb-20 pt-10 text-white sm:px-12">
        <svg aria-hidden className="absolute -right-40 -top-40 h-[560px] w-[560px] opacity-[0.14]" viewBox="0 0 400 400" fill="none" stroke="white">
          {[70, 120, 170, 220].map((r) => <circle key={r} cx="200" cy="200" r={r} />)}
        </svg>
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Mark className="h-11 w-11" />
            <div className="leading-none"><div className="font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">airtel</div><div className="font-display text-xl font-bold">Vyapaar Connect</div></div>
          </div>
          <span className="rounded-full border border-white/25 bg-white/15 px-3.5 py-1.5 text-xs font-bold">Data privacy &amp; security note</span>
        </div>
        <h1 className="relative mt-10 font-display text-4xl font-bold leading-[1.05] tracking-[-0.035em] sm:text-5xl">Your business data,<br />handled with care.</h1>
        <p className="relative mt-4 max-w-3xl text-base leading-relaxed text-white/85 sm:text-lg">
          How a shop owner's information is collected, used, protected and deleted, at every step from the first chat to a live connection.
          Designed around India's Digital Personal Data Protection (DPDP) Act, 2023.
        </p>
      </section>

      <div className="relative -mt-12 grid gap-4 px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        {PRINCIPLES.map(({ icon: Icon, title, body }) => (
          <div key={title} className="card p-5 shadow-[var(--shadow-lift)]">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand"><Icon className="h-5 w-5" /></span>
            <div className="mt-4 font-display font-semibold">{title}</div>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
          </div>
        ))}
      </div>

      <section className="mt-12">
        <div className="eyebrow">Data minimisation</div>
        <h2 className="mt-1 font-display text-2xl font-bold tracking-tight">What we collect, why, and how it is protected</h2>
        <div className="card mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-[#fbfaf8] text-left text-[11px] uppercase tracking-[0.12em] text-muted">
              <tr>{["Step", "What we collect", "Why", "Protection"].map((h) => <th key={h} className="border-b border-line px-5 py-3 font-bold">{h}</th>)}</tr>
            </thead>
            <tbody>
              {STEPS.map(([step, what, why, how], i) => (
                <tr key={step} className="border-b border-line last:border-0">
                  <td className="px-5 py-4 align-top font-bold"><span className="inline-flex items-center gap-2"><span className="grid h-6 w-6 place-items-center rounded-full bg-ink text-[11px] text-white">{i + 1}</span>{step}</span></td>
                  <td className="px-5 py-4 align-top text-ink-2">{what}</td>
                  <td className="px-5 py-4 align-top text-ink-2">{why}</td>
                  <td className="px-5 py-4 align-top text-ink-2"><span className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" />{how}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <div className="card p-6">
          <BoxTitle icon={Users}>Who can see what</BoxTitle>
          <dl className="mt-4 space-y-3 text-sm">
            {WHO.map(([k, v]) => <div key={k} className="grid grid-cols-[110px_1fr] gap-3"><dt className="font-bold">{k}</dt><dd className="text-muted">{v}</dd></div>)}
          </dl>
        </div>
        <div className="card p-6">
          <BoxTitle icon={Clock3}>How long we keep it</BoxTitle>
          <dl className="mt-4 space-y-3 text-sm">
            {KEEP.map(([k, v]) => <div key={k} className="grid grid-cols-[110px_1fr] gap-3"><dt className="font-bold">{k}</dt><dd className="text-muted">{v}</dd></div>)}
          </dl>
        </div>
        <div className="card p-6">
          <BoxTitle icon={ShieldCheck}>Customer controls &amp; safeguards</BoxTitle>
          <ul className="mt-4 space-y-2.5 text-sm text-ink-2">
            {CONTROLS.map((x) => <li key={x} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" />{x}</li>)}
          </ul>
        </div>
        <div className="card bg-[#fbfaf8] p-6">
          <BoxTitle icon={CircleAlert}>Before a real launch</BoxTitle>
          <ul className="mt-4 space-y-2.5 text-sm text-ink-2">
            {LAUNCH.map((x) => <li key={x} className="flex gap-2"><Plus className="mt-0.5 h-4 w-4 shrink-0 text-brand" />{x}</li>)}
          </ul>
        </div>
      </div>
    </div>
  );
}
