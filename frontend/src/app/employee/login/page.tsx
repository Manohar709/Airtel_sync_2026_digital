"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { api, setSession } from "@/lib/api";
import Logo from "@/components/Logo";
import { Button, ErrorNote, Field } from "@/components/ui";

export default function EmployeeLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const r = await api("/api/auth/employee/login", { body: { email, password }, as: "employee" });
      setSession("employee", r.token, r.user);
      router.replace("/employee");
    } catch (x) { setErr(x); } finally { setBusy(false); }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-night-gradient p-12 text-white lg:flex lg:flex-col">
        <svg aria-hidden className="absolute -right-48 -top-40 h-[720px] w-[720px] opacity-[0.12]" viewBox="0 0 400 400" fill="none" stroke="white">
          {[70, 120, 170, 220, 270].map((r) => <circle key={r} cx="330" cy="70" r={r} strokeWidth="1" />)}
        </svg>
        <div className="relative"><Logo tone="light" suffix="Staff" /></div>
        <div className="relative mt-auto max-w-lg">
          <p className="font-display text-[2.6rem] font-bold leading-[1.08] tracking-[-0.03em]">Every customer, with full context, in one queue.</p>
          <ul className="mt-8 space-y-3 text-white/75">
            {["Call-backs and verification holds ranked by urgency", "Clean applications are approved automatically", "One tap to call, message, schedule or activate"].map((x) => (
              <li key={x} className="flex items-center gap-3"><span className="h-1.5 w-1.5 rounded-full bg-brand" />{x}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="flex items-center justify-center bg-surface p-6">
        <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-8">
          <div className="lg:hidden"><Logo suffix="Staff" /></div>
          <div>
            <div className="flex items-center gap-2"><Lock className="h-4 w-4 text-brand" /><h1 className="h2">Staff sign in</h1></div>
            <p className="mt-1 text-sm text-muted">For authorised team members only.</p>
          </div>
          <Field label="Work email"><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required /></Field>
          <Field label="Password"><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></Field>
          <ErrorNote error={err} />
          <Button className="w-full" loading={busy}>Sign in</Button>
          <a href="/" className="block text-center text-sm font-semibold text-muted hover:text-ink">Back to customer site</a>
        </form>
      </div>
    </div>
  );
}
