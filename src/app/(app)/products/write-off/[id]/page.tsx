import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getStoreId } from "@/lib/store-context";
import { auth } from "@/lib/auth";
import { WriteOffDetail } from "@/components/write-off/write-off-detail";

export default async function WriteOffDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER", "WAREHOUSE"].includes(session.user.role ?? "")) redirect(`/store/${await getStoreId()}/pos`);
  const { id } = await params;
  // Confirmed live in UMAG: Списание detail shows Цена/Итого to Складской работник too (unlike Приёмка/Склад).
  return <WriteOffDetail id={id} />;
}
