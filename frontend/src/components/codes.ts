"use client";
import { useTranslations } from "next-intl";

export type CodeMsg = { code: string; params?: Record<string, unknown> };

/** Turns backend message codes (+params) into localised text. Product ids become catalogue names. */
export function useCodeText(names: Record<string, string> = {}) {
  const t = useTranslations();
  return (m: CodeMsg | undefined | null, fallback?: string) => {
    if (!m) return fallback || "";
    const p: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(m.params || {})) {
      if (k === "ids" && Array.isArray(v)) p.names = v.map((i) => names[i as string] || i).join(", ");
      else if (k === "fields" && Array.isArray(v)) p.fields = v.map((f) => (t.has(`fieldNames.${f}`) ? t(`fieldNames.${f}`) : f)).join(", ");
      else if (k === "need") p.need = t.has(`needs.${v}`) ? t(`needs.${v}`) : String(v);
      else if (k === "reg_status") p.reg_status = String(v);
      else p[k] = typeof v === "number" ? v : String(v ?? "");
    }
    const key = `codes.${m.code}`;
    return t.has(key) ? t(key, p) : fallback || m.code;
  };
}
