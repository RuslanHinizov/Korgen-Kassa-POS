import { redirect } from "next/navigation";
import { getStoreId } from "@/lib/store-context";

export default async function StatisticsPage() {
  redirect(`/store/${await getStoreId()}/reports/statistics/products`);
}
