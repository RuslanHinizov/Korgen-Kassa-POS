import { prisma } from "@/lib/db";

/** The currently open shift for a user in a given store (null if none). */
export async function getOpenShift(userId: string, storeId: string) {
  return prisma.shift.findFirst({
    where: { userId, storeId, status: "OPEN" },
    orderBy: { openedAt: "desc" },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cashReceivedForSale(sale: any): number {
  const total = Number(sale.total);
  const lines = sale.paymentLines;
  if (Array.isArray(lines) && lines.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cashLine = lines.find((p: any) => p.method === "CASH");
    if (!cashLine) return 0;
    return Number(cashLine.amount) - Number(sale.changeDue ?? 0);
  }
  if (sale.paymentMethod === "CASH") return total; // tendered − change = total
  return 0;
}

export interface ShiftReport {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  shift: any;
  openingFloat: number;
  grossSales: number;
  costTotal: number;
  profit: number;
  taxTotal: number;
  tipTotal: number;
  discountTotal: number;
  txCount: number;
  voidedCount: number;
  refundCount: number;
  refundTotal: number;
  byMethod: Record<string, number>;
  cashSales: number;
  cashIn: number;
  cashOut: number;
  expectedCash: number;
  countedCash: number | null;
  difference: number | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  movements: any[];
}

/** Aggregate an X-report (mid-shift) or Z-report (closed) for a shift. */
export async function computeShiftReport(shiftId: string): Promise<ShiftReport | null> {
  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    include: {
      user: { select: { name: true, email: true } },
      sales: { include: { refunds: true, items: { include: { product: { select: { cost: true, price: true } } } } } },
      cashMovements: { include: { user: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!shift) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const completed = shift.sales.filter((s: any) => s.status === "COMPLETED");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const voided = shift.sales.filter((s: any) => s.status === "VOIDED");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const refundedSales = shift.sales.filter((s: any) => s.status === "REFUNDED");

  const grossSales = completed.reduce((a: number, s: { total: unknown }) => a + Number(s.total), 0);
  // Profit as in UMAG's shift report: (sales − returns) − (cost of sold − cost of returned). A product without a purchase
  // price counts as cost 0. A fully refunded sale is still a sale of this shift; its refund is what comes off.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const soldSales = shift.sales.filter((s: any) => s.status !== "VOIDED");
  const unitCostByProduct = new Map<string, number>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const s of soldSales as any[]) for (const i of s.items) if (i.productId) unitCostByProduct.set(i.productId, Number(i.product?.cost ?? 0));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const soldRevenue = soldSales.reduce((a: number, s: any) => a + Number(s.total), 0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const soldCost = soldSales.reduce((a: number, s: any) => a + s.items.reduce((b: number, i: any) => b + Number(i.quantity) * Number(i.product?.cost ?? 0), 0), 0);
  let returnedRevenue = 0;
  let returnedCost = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const s of soldSales as any[]) {
    for (const r of s.refunds) {
      returnedRevenue += Number(r.amount);
      for (const l of Array.isArray(r.items) ? (r.items as { productId?: string | null; quantity: number }[]) : []) {
        returnedCost += Number(l.quantity) * (l.productId ? (unitCostByProduct.get(l.productId) ?? 0) : 0);
      }
    }
  }
  const costTotal = soldCost - returnedCost;
  const profit = soldRevenue - returnedRevenue - costTotal;
  const taxTotal = completed.reduce((a: number, s: { taxAmount: unknown }) => a + Number(s.taxAmount ?? 0), 0);
  const tipTotal = completed.reduce((a: number, s: { tipAmount: unknown }) => a + Number(s.tipAmount ?? 0), 0);
  const discountTotal = completed.reduce((a: number, s: { discountAmount: unknown }) => a + Number(s.discountAmount ?? 0), 0);

  const byMethod: Record<string, number> = { CASH: 0, CARD: 0, OTHER: 0 };
  for (const s of completed) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lines = (s as any).paymentLines;
    if (Array.isArray(lines) && lines.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const p of lines as any[]) byMethod[p.method] = (byMethod[p.method] ?? 0) + Number(p.amount);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      byMethod[(s as any).paymentMethod] = (byMethod[(s as any).paymentMethod] ?? 0) + Number((s as any).total);
    }
  }

  // Cash into the drawer counts COMPLETED *and* later-REFUNDED sales (the cash
  // physically entered the drawer); refunds are then subtracted separately.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cashBearing = shift.sales.filter((s: any) => s.status !== "VOIDED");
  const cashSales = cashBearing.reduce((a: number, s: unknown) => a + cashReceivedForSale(s), 0);
  const refundTotal = shift.sales.reduce(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (a: number, s: any) => a + s.refunds.reduce((b: number, r: { amount: unknown }) => b + Number(r.amount), 0),
    0
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cashIn = shift.cashMovements.filter((m: any) => m.type === "DEPOSIT").reduce((a: number, m: { amount: unknown }) => a + Number(m.amount), 0);
  const cashOut = shift.cashMovements
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((m: any) => m.type === "EXPENSE" || m.type === "DIVIDEND")
    .reduce((a: number, m: { amount: unknown }) => a + Number(m.amount), 0);

  const openingFloat = Number(shift.openingFloat);
  const expectedCash = openingFloat + cashSales + cashIn - cashOut - refundTotal;
  const countedCash = shift.countedCash != null ? Number(shift.countedCash) : null;

  return {
    shift,
    openingFloat,
    grossSales,
    costTotal,
    profit,
    taxTotal,
    tipTotal,
    discountTotal,
    txCount: completed.length,
    voidedCount: voided.length,
    refundCount: refundedSales.length,
    refundTotal,
    byMethod,
    cashSales,
    cashIn,
    cashOut,
    expectedCash,
    countedCash,
    difference:
      shift.difference != null
        ? Number(shift.difference)
        : countedCash != null
          ? countedCash - expectedCash
          : null,
    movements: shift.cashMovements,
  };
}

/**
 * What this shift's sales and refunds put into each register's cash account (accountId → amount), mirroring the credit in
 * POST /api/sales and the debit in the refund route. Closing the shift takes exactly this back out, so a register's account
 * only ever holds the cash of the shift that is open (UMAG behaves the same: closed registers show 0).
 */
export async function registerCashOfShift(shiftId: string): Promise<Map<string, number>> {
  const sales = await prisma.sale.findMany({
    where: { shiftId, status: { not: "VOIDED" }, cashboxId: { not: null } },
    select: { total: true, paymentMethod: true, paymentLines: true, cashbox: { select: { accountId: true } }, refunds: { select: { amount: true } } },
  });
  const byAccount = new Map<string, number>();
  const add = (id: string | null | undefined, amount: number) => {
    if (id && amount) byAccount.set(id, (byAccount.get(id) ?? 0) + amount);
  };
  for (const s of sales) {
    const lines = Array.isArray(s.paymentLines) ? (s.paymentLines as unknown as { method: string; amount: number }[]) : [];
    const cashKept = lines.length > 0 ? lines.filter((l) => l.method === "CASH").reduce((a, l) => a + Number(l.amount), 0) : s.paymentMethod === "CASH" ? Number(s.total) : 0;
    add(s.cashbox?.accountId, cashKept);
    if (s.paymentMethod === "CASH") add(s.cashbox?.accountId, -s.refunds.reduce((a, r) => a + Number(r.amount), 0));
  }
  // Cash in/out made at the till moved the same account too (Вложения +, Расходы/Дивиденды −).
  const movements = await prisma.cashMovement.findMany({ where: { shiftId, accountId: { not: null } }, select: { type: true, amount: true, accountId: true } });
  for (const m of movements) add(m.accountId, m.type === "DEPOSIT" ? Number(m.amount) : -Number(m.amount));
  return byAccount;
}
