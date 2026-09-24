import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/superadmin";

// Kazakhstan is a single UTC+5 zone; "today" for a market means its own local day, not the server's.
const TZ_OFFSET_MS = 5 * 3600_000;
function localDayStart(now: Date) {
  const local = new Date(now.getTime() + TZ_OFFSET_MS);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - TZ_OFFSET_MS);
}
const localHour = (d: Date) => new Date(d.getTime() + TZ_OFFSET_MS).getUTCHours();
const PAYMENT_LABEL: Record<string, string> = { CASH: "Наличные", CARD: "Карта", OTHER: "Другое", CREDIT: "В долг" };
const ONLINE_WINDOW_MS = 15 * 60_000;

// GET /api/superadmin/stores/:id/overview — one market's whole picture for the platform owner
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const store = await prisma.store.findUnique({ where: { id } });
  if (!store) return NextResponse.json({ error: "Магазин не найден" }, { status: 404 });

  const now = new Date();
  const dayStart = localDayStart(now);
  const yesterdayStart = new Date(dayStart.getTime() - 86400_000);
  const weekStart = new Date(dayStart.getTime() - 6 * 86400_000);
  const monthStart = new Date(dayStart.getTime() - 29 * 86400_000);

  const [todaySales, yesterdaySales, weekAgg, monthAgg, refundsToday, dailyRows, openShifts, closedShifts, assignments,
    inv, invValue, customers, suppliers, cashboxes, drafts, docsToday, lastSale] = await Promise.all([
    prisma.sale.findMany({
      where: { storeId: id, createdAt: { gte: dayStart } },
      select: { createdAt: true, total: true, status: true, paymentMethod: true, userId: true, user: { select: { name: true } }, items: { select: { name: true, quantity: true, total: true } } },
    }),
    prisma.sale.findMany({ where: { storeId: id, status: "COMPLETED", createdAt: { gte: yesterdayStart, lt: dayStart } }, select: { createdAt: true, total: true } }),
    prisma.sale.aggregate({ where: { storeId: id, status: "COMPLETED", createdAt: { gte: weekStart } }, _sum: { total: true }, _count: true }),
    prisma.sale.aggregate({ where: { storeId: id, status: "COMPLETED", createdAt: { gte: monthStart } }, _sum: { total: true }, _count: true }),
    prisma.refund.aggregate({ where: { sale: { storeId: id }, createdAt: { gte: dayStart } }, _sum: { amount: true }, _count: true }),
    prisma.$queryRaw<{ day: string; revenue: number; checks: bigint }[]>(Prisma.sql`
      SELECT to_char(date_trunc('day', "createdAt" + interval '5 hours'), 'YYYY-MM-DD') AS day,
             COALESCE(SUM(total), 0)::float AS revenue, COUNT(*) AS checks
      FROM "Sale" WHERE "storeId" = ${id} AND status = 'COMPLETED'::"SaleStatus" AND "createdAt" >= ${new Date(dayStart.getTime() - 13 * 86400_000)}
      GROUP BY 1 ORDER BY 1`),
    prisma.shift.findMany({
      where: { storeId: id, status: "OPEN" }, orderBy: { openedAt: "asc" },
      include: { user: { select: { name: true } }, sales: { select: { total: true, status: true, createdAt: true } }, cashMovements: { select: { type: true, amount: true } } },
    }),
    prisma.shift.findMany({ where: { storeId: id, status: "CLOSED" }, orderBy: { closedAt: "desc" }, take: 5, include: { user: { select: { name: true } } } }),
    prisma.userStoreAssignment.findMany({
      where: { storeId: id },
      select: { user: { select: { id: true, name: true, lastName: true, role: true, phone: true, firedAt: true, createdAt: true, sessions: { select: { createdAt: true, updatedAt: true, expiresAt: true }, orderBy: { updatedAt: "desc" }, take: 1 } } } },
    }),
    prisma.$queryRaw<{ active: bigint; zero: bigint; low: bigint; negative: bigint }[]>(Prisma.sql`
      SELECT COUNT(*) AS active,
             COUNT(*) FILTER (WHERE stock = 0) AS zero,
             COUNT(*) FILTER (WHERE stock > 0 AND stock <= "lowStockThreshold") AS low,
             COUNT(*) FILTER (WHERE stock < 0) AS negative
      FROM "Product" WHERE "storeId" = ${id} AND "deletedAt" IS NULL`),
    prisma.$queryRaw<{ cost: number | null; sale: number | null }[]>(Prisma.sql`
      SELECT SUM(GREATEST(stock, 0) * COALESCE(cost, 0))::float AS cost, SUM(GREATEST(stock, 0) * price)::float AS sale
      FROM "Product" WHERE "storeId" = ${id} AND "deletedAt" IS NULL`),
    prisma.customer.count({ where: { storeId: id } }),
    prisma.supplier.count({ where: { storeId: id } }),
    prisma.cashbox.findMany({ where: { storeId: id }, orderBy: { no: "asc" }, select: { id: true, name: true, active: true, pairedAt: true, platform: true, appVersion: true, lastSyncAt: true } }),
    Promise.all([
      prisma.purchaseReceipt.count({ where: { storeId: id, status: "DRAFT" } }),
      prisma.stocktake.count({ where: { storeId: id, status: { in: ["DRAFT", "COUNTING", "REVIEWING"] } } }),
      prisma.writeOff.count({ where: { storeId: id, status: "DRAFT" } }),
    ]),
    Promise.all([
      prisma.purchaseReceipt.count({ where: { storeId: id, status: "POSTED", postedAt: { gte: dayStart } } }),
      prisma.writeOff.count({ where: { storeId: id, status: "POSTED", postedAt: { gte: dayStart } } }),
      prisma.stocktake.count({ where: { storeId: id, status: "POSTED", postedAt: { gte: dayStart } } }),
      prisma.stockIn.count({ where: { storeId: id, status: "POSTED", postedAt: { gte: dayStart } } }),
    ]),
    prisma.sale.findFirst({ where: { storeId: id }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);

  // ---- today ----
  const done = todaySales.filter((s) => s.status === "COMPLETED");
  const revenueToday = done.reduce((a, s) => a + Number(s.total), 0);
  const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, revenue: 0, checks: 0, yesterday: 0 }));
  for (const s of done) { const b = hourly[localHour(s.createdAt)]; b.revenue += Number(s.total); b.checks += 1; }
  for (const s of yesterdaySales) hourly[localHour(s.createdAt)].yesterday += Number(s.total);
  const byPayment = new Map<string, { amount: number; checks: number }>();
  const byCashier = new Map<string, { name: string; checks: number; revenue: number }>();
  const byProduct = new Map<string, { name: string; qty: number; revenue: number }>();
  for (const s of done) {
    const p = byPayment.get(s.paymentMethod) ?? { amount: 0, checks: 0 };
    p.amount += Number(s.total); p.checks += 1; byPayment.set(s.paymentMethod, p);
    const c = byCashier.get(s.userId) ?? { name: s.user.name.trim(), checks: 0, revenue: 0 };
    c.checks += 1; c.revenue += Number(s.total); byCashier.set(s.userId, c);
    for (const i of s.items) {
      const pr = byProduct.get(i.name) ?? { name: i.name, qty: 0, revenue: 0 };
      pr.qty += Number(i.quantity); pr.revenue += Number(i.total); byProduct.set(i.name, pr);
    }
  }
  const yesterdayTotal = yesterdaySales.reduce((a, s) => a + Number(s.total), 0);
  const yesterdaySameTime = yesterdaySales.filter((s) => s.createdAt.getTime() - yesterdayStart.getTime() <= now.getTime() - dayStart.getTime()).reduce((a, s) => a + Number(s.total), 0);

  // ---- shifts ----
  const shiftsOut = openShifts.map((s) => {
    const sales = s.sales.filter((x) => x.status === "COMPLETED");
    const lastSaleAt = sales.reduce<Date | null>((m, x) => (!m || x.createdAt > m ? x.createdAt : m), null);
    return {
      id: s.id, cashier: s.user.name.trim(), openedAt: s.openedAt, openingFloat: Number(s.openingFloat),
      checks: sales.length, revenue: sales.reduce((a, x) => a + Number(x.total), 0), lastSaleAt,
      cashIn: s.cashMovements.filter((m) => m.type === "IN").reduce((a, m) => a + Number(m.amount), 0),
      cashOut: s.cashMovements.filter((m) => m.type !== "IN").reduce((a, m) => a + Number(m.amount), 0),
    };
  });

  // ---- people ----
  const employees = assignments.map((a) => {
    const u = a.user; const sess = u.sessions[0];
    return {
      id: u.id, name: [u.name, u.lastName].filter(Boolean).join(" ").trim(), role: u.role, phone: u.phone, fired: !!u.firedAt,
      lastSeenAt: sess?.updatedAt ?? null,
      online: !!sess && sess.expiresAt > now && now.getTime() - sess.updatedAt.getTime() < ONLINE_WINDOW_MS,
    };
  }).sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));

  // ---- alerts ----
  const alerts: { level: "danger" | "warn" | "info"; text: string }[] = [];
  if (store.suspendedAt) alerts.push({ level: "info", text: `Магазин приостановлен${store.suspendedMessage ? `: ${store.suspendedMessage}` : ""}` });
  if (!employees.some((e) => e.role === "ADMIN" && !e.fired)) alerts.push({ level: "danger", text: "У магазина нет активного администратора" });
  for (const s of shiftsOut) {
    const hours = (now.getTime() - s.openedAt.getTime()) / 3600_000;
    if (hours > 14) alerts.push({ level: "warn", text: `Смена ${s.cashier} открыта уже ${Math.floor(hours)} ч — возможно, забыли закрыть` });
    else if (hours > 3 && (!s.lastSaleAt || now.getTime() - s.lastSaleAt.getTime() > 3 * 3600_000)) alerts.push({ level: "warn", text: `В смене ${s.cashier} нет продаж более 3 часов` });
  }
  const badClose = closedShifts.find((s) => s.difference != null && Math.abs(Number(s.difference)) >= 0.5);
  if (badClose) alerts.push({ level: "warn", text: `Расхождение в кассе при закрытии смены (${badClose.user.name.trim()}): ${Number(badClose.difference).toLocaleString("ru-RU")} ₸` });
  const negative = Number(inv[0]?.negative ?? 0);
  if (negative > 0) alerts.push({ level: "warn", text: `Товаров с отрицательным остатком: ${negative}` });
  for (const c of cashboxes) {
    if (c.active && c.pairedAt && (!c.lastSyncAt || now.getTime() - c.lastSyncAt.getTime() > 24 * 3600_000)) alerts.push({ level: "info", text: `Касса «${c.name}» не выходила на связь более суток` });
  }
  if (store.suspendedAt === null && lastSale === null && now.getTime() - store.createdAt.getTime() > 3 * 86400_000) alerts.push({ level: "info", text: "За всё время не было ни одной продажи" });

  return NextResponse.json({
    store: { id: store.id, name: store.name, address: store.address, createdAt: store.createdAt, suspendedAt: store.suspendedAt, suspendedMessage: store.suspendedMessage },
    generatedAt: now,
    today: {
      revenue: revenueToday, checks: done.length, avgCheck: done.length ? revenueToday / done.length : 0,
      refunds: { count: refundsToday._count, amount: Number(refundsToday._sum.amount ?? 0) },
      voided: todaySales.filter((s) => s.status === "VOIDED").length,
      yesterdayTotal, yesterdaySameTime, lastSaleAt: lastSale?.createdAt ?? null,
    },
    week: { revenue: Number(weekAgg._sum.total ?? 0), checks: weekAgg._count },
    month: { revenue: Number(monthAgg._sum.total ?? 0), checks: monthAgg._count },
    hourly,
    // Days without a single sale still get a (zero) bar, so gaps read as gaps.
    daily: Array.from({ length: 14 }, (_, i) => {
      const day = new Date(dayStart.getTime() - (13 - i) * 86400_000 + TZ_OFFSET_MS).toISOString().slice(0, 10);
      const row = dailyRows.find((r) => r.day === day);
      return { day, revenue: Number(row?.revenue ?? 0), checks: Number(row?.checks ?? 0) };
    }),
    payments: [...byPayment].map(([method, v]) => ({ method: PAYMENT_LABEL[method] ?? method, ...v })).sort((a, b) => b.amount - a.amount),
    cashiers: [...byCashier.values()].sort((a, b) => b.revenue - a.revenue),
    topProducts: [...byProduct.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 8),
    openShifts: shiftsOut,
    closedShifts: closedShifts.map((s) => ({
      id: s.id, cashier: s.user.name.trim(), openedAt: s.openedAt, closedAt: s.closedAt,
      expectedCash: s.expectedCash != null ? Number(s.expectedCash) : null, countedCash: s.countedCash != null ? Number(s.countedCash) : null,
      difference: s.difference != null ? Number(s.difference) : null,
    })),
    employees,
    inventory: {
      products: Number(inv[0]?.active ?? 0), zero: Number(inv[0]?.zero ?? 0), low: Number(inv[0]?.low ?? 0), negative,
      valueAtCost: invValue[0]?.cost ?? 0, valueAtSale: invValue[0]?.sale ?? 0,
    },
    counts: { customers, suppliers },
    cashboxes,
    drafts: { purchaseReceipts: drafts[0], stocktakes: drafts[1], writeOffs: drafts[2] },
    docsToday: { purchaseReceipts: docsToday[0], writeOffs: docsToday[1], stocktakes: docsToday[2], stockIns: docsToday[3] },
    alerts,
  });
}
