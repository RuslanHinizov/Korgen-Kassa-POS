import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { SupportInbox } from "@/components/superadmin/support-inbox";

export const dynamic = "force-dynamic";

export default async function SuperAdminSupportPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  if (session.user.role !== "SUPERADMIN") redirect("/");
  return <SupportInbox />;
}
