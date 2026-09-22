import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getStoreId } from "@/lib/store-context";
import { auth } from "@/lib/auth";
import { StockInDetail } from "@/components/stock-in/stock-in-detail";

export default async function StockInDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER", "WAREHOUSE"].includes(session.user.role ?? "")) redirect(`/store/${await getStoreId()}/pos`);
  const { id } = await params;
  return (
    <StockInDetail
      id={id}
      // UMAG lets Складской работник post/close their own Оприходование too — just never see cost.
      canPost={["ADMIN", "MANAGER", "WAREHOUSE"].includes(session.user.role ?? "")}
      canSeeCost={["ADMIN", "MANAGER"].includes(session.user.role ?? "")}
    />
  );
}
