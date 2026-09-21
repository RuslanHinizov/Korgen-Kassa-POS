import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { getStoreId } from "@/lib/store-context";
import { auth } from "@/lib/auth";
import { PaymentForm } from "@/components/finance/payment-form";

export default async function CreatePaymentPage({ params }: { params: Promise<{ direction: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) redirect(`/store/${await getStoreId()}/pos`);
  const { direction } = await params;
  if (direction !== "in" && direction !== "out") notFound();
  return <PaymentForm direction={direction === "in" ? "IN" : "OUT"} />;
}
