import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

// GET /api/stores — every store the account has (store switcher dropdown)
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Only markets the account works in (SUPERADMIN sees all) — never another market's name.
  const stores = await prisma.store.findMany({
    where: session.user.role === "SUPERADMIN" ? {} : { userAssignments: { some: { userId: session.user.id } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ stores });
}

const createSchema = z.object({ name: z.string().min(1).max(120) });

const DEFAULT_EXPENSE_TYPES = [
  { name: "Дивиденды", active: true, manageable: false, sortOrder: 0 },
  { name: "Другое", active: true, manageable: true, sortOrder: 1 },
  { name: "Закуп мелочей", active: true, manageable: true, sortOrder: 2 },
  { name: "Заработная плата", active: true, manageable: true, sortOrder: 3 },
  { name: "Коммунальные расходы", active: true, manageable: true, sortOrder: 4 },
  { name: "Инкассация", active: true, manageable: true, sortOrder: 5 },
];

// POST /api/stores — create a new store, seeded with its own default Финансы
// data (cash account, expense types, business settings) so the store's
// Финансы pages work immediately, the same way real UMAG's do per-store.
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  // Markets are created by the platform owner (Super Admin panel), not by market admins.
  if (!session || session.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const store = await prisma.$transaction(async (tx) => {
    const created = await tx.store.create({ data: { name: parsed.data.name } });
    await tx.financeAccount.create({ data: { storeId: created.id, name: "Сейф - 1", type: "CASH", allowNegativeBalance: true, showAtPos: true } });
    await tx.expenseType.createMany({ data: DEFAULT_EXPENSE_TYPES.map((e) => ({ ...e, storeId: created.id })) });
    await tx.businessSettings.create({ data: { storeId: created.id, name: parsed.data.name } });
    return created;
  });
  return NextResponse.json({ store }, { status: 201 });
}
