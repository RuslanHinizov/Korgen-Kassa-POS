import { AlertTriangle } from "lucide-react";
import { getTranslations } from "next-intl/server";

interface DbErrorProps {
  page?: string;
}

export async function DbError({ page }: DbErrorProps) {
  const t = await getTranslations("errors");
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center p-8">
      <AlertTriangle className="h-12 w-12 text-destructive" />
      <div>
        <h2 className="text-xl font-semibold">{t("db_title")}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {page ? t("db_desc_page", { page }) : t("db_desc")}
        </p>
      </div>
      <a
        href="."
        className="text-sm underline underline-offset-4 text-muted-foreground hover:text-foreground"
      >
        {t("try_again")}
      </a>
    </div>
  );
}
