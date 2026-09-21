import type { Metadata } from "next";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { POSScreen } from "@/components/pos/pos-screen";

export const metadata: Metadata = { title: "POS" };

export default async function POSPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  return <POSScreen cashierName={session?.user?.name ?? ""} cashierRole={session?.user?.role ?? ""} />;
}
