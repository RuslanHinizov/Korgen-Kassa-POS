import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getStoreId } from "@/lib/store-context";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { DashboardHome } from "@/components/dashboard/dashboard-home";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dashboard" };

export default async function AppHomePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  if (session.user.role === "WAREHOUSE") redirect(`/store/${await getStoreId()}/purchases`);
  if (!["ADMIN", "MANAGER"].includes(session.user.role ?? "")) redirect(`/store/${await getStoreId()}/pos`);

  const t = await getTranslations("dashboard");

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <DashboardHome />
    </div>
  );
}
