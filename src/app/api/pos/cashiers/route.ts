import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hasKioskAccess } from "@/lib/kiosk-device";
import { getStoreId } from "@/lib/store-context";

// GET /api/pos/cashiers — staff list for the kiosk "who's working" PIN picker.
// Only users with a PIN set can be selected (others simply won't appear).
export async function GET() {
  if (!(await hasKioskAccess())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const users = await prisma.user.findMany({
    where: { storeAssignments: { some: { storeId: await getStoreId() } }, role: { in: ["CASHIER", "MANAGER", "WAREHOUSE"] }, pin: { not: null }, firedAt: null, allowCashierLogin: true },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ cashiers: users });
}
