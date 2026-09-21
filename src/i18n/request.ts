import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";

const SUPPORTED_LOCALES = ["en", "si", "ta", "fr", "es", "de", "ar", "zh", "hi", "pt", "ja", "ko", "id", "ru"] as const;
type Locale = (typeof SUPPORTED_LOCALES)[number];

function isValidLocale(value: string | undefined): value is Locale {
  return SUPPORTED_LOCALES.includes(value as Locale);
}

export default getRequestConfig(async () => {
  // Try cookie first (fast path — no DB needed on most requests)
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("olgax_locale")?.value;
  if (cookieLocale && isValidLocale(cookieLocale)) {
    const messages = (await import(`../../messages/${cookieLocale}.json`)).default;
    return { locale: cookieLocale, messages };
  }

  // Fallback: read from DB business settings
  let locale: Locale = "en";
  try {
    const storeId = await getStoreId();
    const settings = await prisma.businessSettings.findUnique({
      where: { storeId },
      select: { language: true },
    });
    const lang = settings?.language ?? "en";
    if (isValidLocale(lang)) locale = lang;
  } catch {
    // DB not available — use English
  }

  const messages = (await import(`../../messages/${locale}.json`)).default;
  return { locale, messages };
});
