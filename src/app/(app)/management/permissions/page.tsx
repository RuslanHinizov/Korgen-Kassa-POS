import { requireRole } from "@/lib/admin-page";
import { SitePermissions } from "@/components/management/site-permissions";

export default async function PermissionsPage() {
  await requireRole();
  return <SitePermissions />;
}
