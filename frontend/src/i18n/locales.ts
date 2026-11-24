export const LOCALES = [
  { code: "en", label: "English", native: "English", speech: "en-IN", script: "latin" },
  { code: "hi", label: "Hindi", native: "हिन्दी", speech: "hi-IN", script: "devanagari" },
  { code: "te", label: "Telugu", native: "తెలుగు", speech: "te-IN", script: "telugu" },
  { code: "ta", label: "Tamil", native: "தமிழ்", speech: "ta-IN", script: "tamil" },
  { code: "kn", label: "Kannada", native: "ಕನ್ನಡ", speech: "kn-IN", script: "kannada" },
  { code: "ml", label: "Malayalam", native: "മലയാളം", speech: "ml-IN", script: "malayalam" },
  { code: "mr", label: "Marathi", native: "मराठी", speech: "mr-IN", script: "devanagari" },
  { code: "bn", label: "Bengali", native: "বাংলা", speech: "bn-IN", script: "bengali" },
  { code: "gu", label: "Gujarati", native: "ગુજરાતી", speech: "gu-IN", script: "gujarati" },
  { code: "pa", label: "Punjabi", native: "ਪੰਜਾਬੀ", speech: "pa-IN", script: "gurmukhi" },
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
