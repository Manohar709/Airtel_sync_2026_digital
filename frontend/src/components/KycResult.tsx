"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, ChevronDown, Clock3, ShieldCheck, Sparkles, Wrench } from "lucide-react";
import { useCodeText } from "./codes";
import { cn } from "./ui";

/* eslint-disable @typescript-eslint/no-explicit-any */
const FIXED = new Set(["gstin.repaired", "number.lookalike", "doc.straightened"]);
const BANNER: Record<string, { icon: any; cls: string }> = {
  pass: { icon: ShieldCheck, cls: "bg-ok-bg text-ok border-ok/20" },
  ask: { icon: Wrench, cls: "bg-warn-bg text-warn border-warn/25" },
  hold: { icon: Clock3, cls: "bg-info-bg text-info border-info/20" },
  incomplete: { icon: Clock3, cls: "bg-surface text-ink-2 border-line" },
};

export function VerdictBanner({ verdict, staff }: { verdict: string; staff?: boolean }) {
  const t = useTranslations("verify");
  const b = BANNER[verdict] || BANNER.incomplete;
  const Icon = b.icon;
  return (
    <div className={cn("flex gap-3 rounded-2xl border p-4", b.cls)} role="status">
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <div>
        <div className="font-bold">{t(staff ? `staff_${verdict}` : `verdict_${verdict}`)}</div>
        <div className="text-sm opacity-90">{t(staff ? `staff_${verdict}_body` : `verdict_${verdict}_body`)}</div>
      </div>
    </div>
  );
}

/** KYC checks grouped by who acts: the customer (to fix), our team, fixed automatically, passed. */
export default function KycResult({ k, names = {}, compact = false, staff = false }: { k: any; names?: Record<string, string>; compact?: boolean; staff?: boolean }) {
  const t = useTranslations("verify");
  const code = useCodeText(names);
  const [showOk, setShowOk] = useState(false);
  const checks: any[] = k.checks || [];
  const fix = checks.filter((c) => c.status === "action_required" || c.status === "pending");
  const team = checks.filter((c) => c.status === "needs_manual_review" || c.status === "unable_to_verify");
  const fixed = checks.filter((c) => c.status === "verified" && FIXED.has(c.code));
  const ok = checks.filter((c) => c.status === "verified" && !FIXED.has(c.code));

  const Row = ({ c, icon: Icon, tone }: { c: any; icon: any; tone: string }) => (
    <li className="flex gap-3 px-4 py-3 text-sm">
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", tone)} aria-hidden />
      <div className="min-w-0">
        {c.doc_type && <div className="text-xs font-semibold text-muted">{t(`doc_${c.doc_type}`)}</div>}
        <div className="text-ink">{code(c, c.detail)}</div>
      </div>
    </li>
  );
  const Group = ({ title, rows, icon, tone }: { title: string; rows: any[]; icon: any; tone: string }) =>
    rows.length ? (
      <div>
        <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">{title} · {rows.length}</div>
        <ul className="divide-y divide-line rounded-2xl border border-line bg-white">{rows.map((c, i) => <Row key={c.id + i} c={c} icon={icon} tone={tone} />)}</ul>
      </div>
    ) : null;

  return (
    <div className="space-y-4">
      {!compact && <VerdictBanner verdict={k.verdict || "incomplete"} staff={staff} />}
      <Group title={t("groupFix")} rows={fix} icon={AlertTriangle} tone="text-warn" />
      <Group title={t("groupTeam")} rows={team} icon={Clock3} tone="text-info" />
      <Group title={t("groupFixed")} rows={fixed} icon={Sparkles} tone="text-brand" />
      {ok.length > 0 && (
        <div>
          <button onClick={() => setShowOk((v) => !v)} className="mb-2 flex w-full items-center justify-between text-xs font-bold uppercase tracking-wider text-muted">
            <span>{t("groupOk")} · {ok.length}</span>
            <ChevronDown className={cn("h-4 w-4 transition", showOk && "rotate-180")} />
          </button>
          {showOk && <ul className="divide-y divide-line rounded-2xl border border-line bg-white">{ok.map((c, i) => <Row key={c.id + i} c={c} icon={CheckCircle2} tone="text-ok" />)}</ul>}
        </div>
      )}
    </div>
  );
}
