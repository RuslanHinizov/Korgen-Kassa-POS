import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getStoreId } from "@/lib/store-context";
import { auth } from "@/lib/auth";
import { PurchaseReceiptScan } from "@/components/purchase-receipts/purchase-receipt-scan";

export default async function PurchaseReceiptScanPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER", "WAREHOUSE"].includes(session.user.role ?? "")) redirect(`/store/${await getStoreId()}/pos`);
  const { id } = await params;
  return <PurchaseReceiptScan id={id} />;
}
