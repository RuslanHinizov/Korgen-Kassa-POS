import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { SuperAdminPanel } from "@/components/superadmin/superadmin-panel";

export const dynamic = "force-dynamic";

export default async function SuperAdminPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  if (session.user.role !== "SUPERADMIN") redirect("/");
  return <SuperAdminPanel userName={session.user.name} />;
}
