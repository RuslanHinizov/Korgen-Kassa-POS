import { redirectTo, requireRole } from "@/lib/admin-page";

export default async function EmployeesIndex() {
  await requireRole(["ADMIN"]);
  return redirectTo("/management/employees/working");
}
