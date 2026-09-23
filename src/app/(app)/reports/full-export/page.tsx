import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getStoreId } from "@/lib/store-context";
import { auth } from "@/lib/auth";
import { FullExportReport } from "@/components/reports/full-export-report";

export default async function FullExportPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) redirect(`/store/${await getStoreId()}/pos`);
  return <FullExportReport />;
}
