import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getStoreId } from "@/lib/store-context";
import { auth } from "@/lib/auth";
import { PurchaseReceiptPrint } from "@/components/purchase-receipts/purchase-receipt-print";

export default async function PurchaseReceiptPrintPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ variant?: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) redirect(`/store/${await getStoreId()}/pos`);
  const { id } = await params;
  const { variant } = await searchParams;
  return <PurchaseReceiptPrint id={id} variant={variant === "cost" || variant === "sale" ? variant : "plain"} />;
}
