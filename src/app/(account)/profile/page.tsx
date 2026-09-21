import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { EmployeeProfile } from "@/components/account/employee-profile";

export const dynamic = "force-dynamic";

export default async function EmployeeProfilePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const assignments = await prisma.userStoreAssignment.findMany({
    where: { userId: session.user.id },
    select: { store: { select: { id: true, name: true, address: true, createdAt: true } } },
    orderBy: { createdAt: "asc" },
  });
  return <EmployeeProfile user={{ name: session.user.name ?? "", email: session.user.email, role: session.user.role ?? "CASHIER" }} stores={assignments.map((assignment) => assignment.store)} />;
}
