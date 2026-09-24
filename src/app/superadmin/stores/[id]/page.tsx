import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { StoreDetail } from "@/components/superadmin/store-detail";

export const dynamic = "force-dynamic";

export default async function SuperAdminStorePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  if (session.user.role !== "SUPERADMIN") redirect("/");
  const { id } = await params;
  return <StoreDetail storeId={id} userName={session.user.name} />;
}
