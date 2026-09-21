import { requireRole } from "@/lib/admin-page";
import { CashboxesList } from "@/components/management/cashboxes-list";

export default async function CashboxesPage() {
  await requireRole();
  return <CashboxesList />;
}
