"use client";
import { useTranslations } from "next-intl";
import { PageError } from "@/components/ui/page-error";
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("nav");
  return <PageError error={error} reset={reset} label={t("products")} />;
}
