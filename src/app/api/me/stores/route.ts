import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/** The authenticated employee's explicitly assigned work locations. */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const assignments = await prisma.userStoreAssignment.findMany({
    where: { userId: session.user.id },
    select: { store: { select: { id: true, name: true, address: true } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ stores: assignments.map((assignment) => assignment.store) });
}
