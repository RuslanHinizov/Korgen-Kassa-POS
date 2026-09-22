import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getStoreId } from "@/lib/store-context";
import { auth } from "@/lib/auth";
import { WarehouseStockList } from "@/components/products/warehouse-stock-list";

export default async function ProductsStockPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER", "WAREHOUSE"].includes(session.user.role ?? "")) redirect(`/store/${await getStoreId()}/pos`);
  return <WarehouseStockList />;
}
