import { requireRole } from "@/lib/admin-page";
import { EmployeeForm } from "@/components/management/employee-form";

export default async function EditEmployeePage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(["ADMIN"]);
  const { id } = await params;
  return <EmployeeForm id={id} />;
}
