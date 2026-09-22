import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getStoreId } from "@/lib/store-context";
import { auth } from "@/lib/auth";
import { QuickPurchaseReceiptForm } from "@/components/purchase-receipts/quick-purchase-receipt-form";

export default async function QuickPurchaseReceiptPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER", "WAREHOUSE"].includes(session.user.role ?? "")) redirect(`/store/${await getStoreId()}/pos`);
  return <QuickPurchaseReceiptForm />;
}
