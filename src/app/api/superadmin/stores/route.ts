import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/superadmin";
import { newCashierCode } from "@/lib/employees";
import { normalizePhone, syntheticEmail } from "@/lib/phone";

const DEFAULT_EXPENSE_TYPES = [
  { name: "Дивиденды", active: true, manageable: false, sortOrder: 0 },
  { name: "Другое", active: true, manageable: true, sortOrder: 1 },
  { name: "Закуп мелочей", active: true, manageable: true, sortOrder: 2 },
  { name: "Заработная плата", active: true, manageable: true, sortOrder: 3 },
  { name: "Коммунальные расходы", active: true, manageable: true, sortOrder: 4 },
  { name: "Инкассация", active: true, manageable: true, sortOrder: 5 },
];

// GET /api/superadmin/stores — every market with a live snapshot of how it is doing
export async function GET() {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // "Today" is the market's local day (Kazakhstan, UTC+5), the same as on the detail page.
  const local = new Date(Date.now() + 5 * 3600_000);
  local.setUTCHours(0, 0, 0, 0);
  const startOfDay = new Date(local.getTime() - 5 * 3600_000);

  const stores = await prisma.store.findMany({ orderBy: { createdAt: "asc" } });
  const rows = await Promise.all(stores.map(async (s) => {
    const weekStart = new Date(startOfDay.getTime() - 6 * 86400_000);
    const [users, products, salesAgg, lastSale, openShifts, admins, weekAgg, onlineNow] = await Promise.all([
      prisma.userStoreAssignment.count({ where: { storeId: s.id, user: { firedAt: null } } }),
      prisma.product.count({ where: { storeId: s.id, deletedAt: null } }),
      prisma.sale.aggregate({ where: { storeId: s.id, status: "COMPLETED", createdAt: { gte: startOfDay } }, _sum: { total: true }, _count: true }),
      prisma.sale.findFirst({ where: { storeId: s.id }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
      prisma.shift.count({ where: { storeId: s.id, status: "OPEN" } }),
      prisma.user.findMany({ where: { role: "ADMIN", firedAt: null, storeAssignments: { some: { storeId: s.id } } }, select: { name: true, phone: true } }),
      prisma.sale.aggregate({ where: { storeId: s.id, status: "COMPLETED", createdAt: { gte: weekStart } }, _sum: { total: true } }),
      prisma.user.count({ where: { storeAssignments: { some: { storeId: s.id } }, sessions: { some: { expiresAt: { gt: new Date() }, updatedAt: { gt: new Date(Date.now() - 15 * 60_000) } } } } }),
    ]);
    return {
      id: s.id, name: s.name, address: s.address, createdAt: s.createdAt,
      suspendedAt: s.suspendedAt, suspendedMessage: s.suspendedMessage,
      users, products, openShifts, admins, onlineNow, weekRevenue: Number(weekAgg._sum.total ?? 0),
      todaySales: salesAgg._count, todayRevenue: Number(salesAgg._sum.total ?? 0), lastSaleAt: lastSale?.createdAt ?? null,
    };
  }));
  const totals = {
    stores: rows.length,
    suspended: rows.filter((r) => r.suspendedAt).length,
    todayRevenue: rows.reduce((a, r) => a + r.todayRevenue, 0),
    todaySales: rows.reduce((a, r) => a + r.todaySales, 0),
    weekRevenue: rows.reduce((a, r) => a + r.weekRevenue, 0),
    openShifts: rows.reduce((a, r) => a + r.openShifts, 0),
    users: rows.reduce((a, r) => a + r.users, 0),
    onlineNow: rows.reduce((a, r) => a + r.onlineNow, 0),
    noSalesToday: rows.filter((r) => !r.suspendedAt && r.todaySales === 0).length,
  };
  return NextResponse.json({ stores: rows, totals });
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().max(200).optional(),
  adminName: z.string().trim().min(1).max(120),
  adminPhone: z.string().trim().min(5).max(30),
  adminPassword: z.string().min(6).max(100),
});

// POST /api/superadmin/stores — a new market plus its first administrator, ready to hand over
export async function POST(req: NextRequest) {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Проверьте поля (номер телефона, пароль — от 6 символов)" }, { status: 400 });
  const d = parsed.data;
  const phone = normalizePhone(d.adminPhone);
  if (!phone) return NextResponse.json({ error: "Введите корректный номер телефона" }, { status: 400 });
  if (await prisma.user.findUnique({ where: { phone } })) {
    return NextResponse.json({ error: "Пользователь с таким номером телефона уже существует" }, { status: 409 });
  }
  const email = syntheticEmail(phone);

  const store = await prisma.$transaction(async (tx) => {
    const created = await tx.store.create({ data: { name: d.name, address: d.address || null } });
    await tx.financeAccount.create({ data: { storeId: created.id, name: "Сейф - 1", type: "CASH", allowNegativeBalance: true, showAtPos: true } });
    await tx.expenseType.createMany({ data: DEFAULT_EXPENSE_TYPES.map((e) => ({ ...e, storeId: created.id })) });
    await tx.businessSettings.create({ data: { storeId: created.id, name: d.name } });
    return created;
  });

  try {
    await auth.api.signUpEmail({ body: { name: d.adminName, email, password: d.adminPassword } });
    await prisma.user.update({
      where: { email },
      data: { role: "ADMIN", phone, cashierCode: await newCashierCode(), storeAssignments: { create: [{ storeId: store.id }] } },
    });
  } catch (e) {
    // Never leave a market that nobody can sign in to.
    await prisma.store.delete({ where: { id: store.id } }).catch(() => {});
    return NextResponse.json({ error: e instanceof Error ? e.message : "Не удалось создать администратора" }, { status: 500 });
  }
  return NextResponse.json({ store }, { status: 201 });
}
