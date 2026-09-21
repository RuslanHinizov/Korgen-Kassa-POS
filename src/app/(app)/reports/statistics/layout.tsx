import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getStoreId } from "@/lib/store-context";
import { HelpCircle } from "lucide-react";
import { auth } from "@/lib/auth";
import { StatisticsTabs } from "@/components/reports/statistics-tabs";

export default async function StatisticsLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) redirect(`/store/${await getStoreId()}/pos`);

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center gap-1.5">
        <h1 className="text-2xl font-bold">Статистика продаж</h1>
        <HelpCircle className="h-4 w-4 text-muted-foreground" />
      </div>
      <StatisticsTabs />
      {children}
    </div>
  );
}
