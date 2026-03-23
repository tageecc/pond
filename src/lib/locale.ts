export type AppLocale = "zh" | "en"

/** BCP-47 / navigator.language → app locale (default English if not Chinese). */
export function detectSystemLocale(): AppLocale {
  if (typeof navigator === "undefined") return "en"
  const lang =
    navigator.language ||
    (navigator as Navigator & { userLanguage?: string }).userLanguage ||
    "en"
  return lang.toLowerCase().startsWith("zh") ? "zh" : "en"
}

export function isAppLocale(v: unknown): v is AppLocale {
  return v === "zh" || v === "en"
}
