import { requireRole } from "@/lib/admin-page";
import { ReceiptSettings } from "@/components/management/receipt-settings";

export default async function ReceiptPage() {
  await requireRole();
  return <ReceiptSettings />;
}
