import { requireRole } from "@/lib/admin-page";
import { EmployeesList } from "@/components/management/employees-list";

export default async function EmployeesPage() {
  await requireRole(["ADMIN"]);
  return <EmployeesList tab="dismissed" />;
}
