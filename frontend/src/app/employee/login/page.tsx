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
    <div className="grid min-h-screen bg-ink lg:grid-cols-2">
      <div className="relative hidden overflow-hidden p-12 lg:block">
        <div aria-hidden className="absolute -left-40 -top-40 h-[560px] w-[560px] rounded-full bg-[radial-gradient(closest-side,rgb(228_0_0/0.35),transparent)]" />
        <div className="relative"><Logo tone="light" suffix="Employee console" /></div>
        <p className="relative mt-24 max-w-md text-4xl font-extrabold leading-tight tracking-[-0.03em] text-white">Every customer request, with full context, in one place.</p>
      </div>
      <div className="flex items-center justify-center bg-surface p-6">
        <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-8">
          <div className="lg:hidden"><Logo suffix="Employee" /></div>
          <div className="flex items-center gap-2"><Lock className="h-4 w-4 text-brand" /><h1 className="h2">Employee sign in</h1></div>
          <p className="text-sm text-muted">For authorised team members only.</p>
          <Field label="Work email"><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required /></Field>
          <Field label="Password"><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></Field>
          <ErrorNote error={err} />
          <Button className="w-full" loading={busy}>Sign in</Button>
        </form>
      </div>
    </div>
  );
}
