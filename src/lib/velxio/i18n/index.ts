// @ts-nocheck
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import enCommon from "@/lib/velxio/i18n/locales/en/common.json";
import enCommon2 from "@/lib/velxio/i18n/locales/en/common2.json";
import enReleases from "@/lib/velxio/i18n/locales/en/releases.json";
import enDocs from "@/lib/velxio/i18n/locales/en/docs.json";
import enDocs2 from "@/lib/velxio/i18n/locales/en/docs2.json";
import enSeo from "@/lib/velxio/i18n/locales/en/seo.json";
import enSeo2 from "@/lib/velxio/i18n/locales/en/seo2.json";
import enSeo3 from "@/lib/velxio/i18n/locales/en/seo3.json";
import enSeo4 from "@/lib/velxio/i18n/locales/en/seo4.json";

const NAMESPACES = ["common"] as const;
export type Namespace = (typeof NAMESPACES)[number];

void i18n.use(initReactI18next).init({
  resources: {
    en: {
      common: {
        ...enCommon,
        ...enCommon2,
        ...enReleases,
        seo: {
          ...enSeo.seo,
          ...enSeo2.seo,
          ...enSeo3.seo,
          ...enSeo4.seo,
        },
        docs: { ...enDocs.docs, ...enDocs2.docs },
      },
    },
  },
  lng: "en",
  fallbackLng: "en",
  supportedLngs: ["en"],
  ns: NAMESPACES,
  defaultNS: "common",
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

export { i18n };
