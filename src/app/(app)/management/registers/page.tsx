import { redirectTo, requireRole } from "@/lib/admin-page";

// Old address of «Управление кассами»; kept so bookmarks keep working.
export default async function RegistersRedirect() {
  await requireRole();
  return redirectTo("/management/cashboxes");
}
