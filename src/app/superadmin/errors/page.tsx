import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ErrorInbox } from "@/components/superadmin/error-inbox";

export const dynamic = "force-dynamic";

export default async function SuperAdminErrorsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  if (session.user.role !== "SUPERADMIN") redirect("/");
  return <ErrorInbox />;
}
