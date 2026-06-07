// @ts-nocheck
export const LOCALES = ["en"] as const;
export type Locale = "en";
export const DEFAULT_LOCALE: Locale = "en";
export const NON_DEFAULT_LOCALES: Locale[] = [];

export type LocaleMeta = {
  htmlLang: string;
  nativeName: string;
  ogLocale: string;
  dir: "ltr" | "rtl";
};

export const LOCALE_META: Record<Locale, LocaleMeta> = {
  en: { htmlLang: "en", nativeName: "English", ogLocale: "en_US", dir: "ltr" },
};

export function isLocale(value: unknown): value is Locale {
  return value === "en";
}
