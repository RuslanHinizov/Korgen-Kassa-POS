import { requireRole } from "@/lib/admin-page";
import { EmployeeForm } from "@/components/management/employee-form";

export default async function NewEmployeePage() {
  await requireRole(["ADMIN"]);
  return <EmployeeForm />;
}
