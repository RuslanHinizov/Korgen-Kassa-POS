import { redirectTo, requireRole } from "@/lib/admin-page";

// Users moved to Управление → Пользователи.
export default async function UsersRedirect() {
  await requireRole(["ADMIN"]);
  return redirectTo("/management/employees/working");
}
