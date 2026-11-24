"use client";
import { useTranslations } from "next-intl";
import { useCodeText } from "./codes";
import { Status } from "./ui";

/* eslint-disable @typescript-eslint/no-explicit-any */
const STAGES = ["format", "registry", "extraction", "consistency"] as const;

/** Localised KYC checks grouped by stage. */
export default function KycResult({ k, names = {} }: { k: any; names?: Record<string, string> }) {
  const t = useTranslations("verify");
  const code = useCodeText(names);
  return (
    <div className="space-y-5">
      {STAGES.map((st) => {
        const rows = (k.checks || []).filter((c: any) => c.stage === st);
        if (!rows.length) return null;
        return (
          <div key={st}>
            <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">{t(`stage_${st}`)}</div>
            <ul className="divide-y divide-line rounded-2xl border border-line">
              {rows.map((c: any) => (
                <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    {c.doc_type && <div className="text-xs font-semibold text-muted">{t(`doc_${c.doc_type}`)}</div>}
                    <div className="text-ink">{code(c, c.detail)}</div>
                  </div>
                  <Status s={c.status} />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
