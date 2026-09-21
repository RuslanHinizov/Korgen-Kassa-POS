import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getStoreId } from "@/lib/store-context";
import { unstable_noStore as noStore } from "next/cache";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { ReportsDashboard } from "@/components/reports/reports-dashboard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage() {
  noStore();
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    redirect(`/store/${await getStoreId()}/pos`);
  }

  const t = await getTranslations("reports");

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <ReportsDashboard />
    </div>
  );
}
