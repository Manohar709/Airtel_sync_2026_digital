export const LOCALES = [
  { code: "en", label: "English", native: "English", speech: "en-IN", script: "latin" },
  { code: "hi", label: "Hindi", native: "हिन्दी", speech: "hi-IN", script: "devanagari" },
  { code: "te", label: "Telugu", native: "తెలుగు", speech: "te-IN", script: "telugu" },
] as const;

export type Locale = (typeof LOCALES)[number]["code"];
export const DEFAULT_LOCALE: Locale = "en";
export const isLocale = (v: unknown): v is Locale => LOCALES.some((l) => l.code === v);
export const localeInfo = (c: Locale) => LOCALES.find((l) => l.code === c)!;

export function detectLocale(): Locale {
  if (typeof navigator === "undefined") return DEFAULT_LOCALE;
  for (const l of navigator.languages || [navigator.language]) {
    const base = l.toLowerCase().split("-")[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}
