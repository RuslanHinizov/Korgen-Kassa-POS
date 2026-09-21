import { prisma } from "@/lib/db";

/** Positive = customer owes the store ("на кредит" sales not yet repaid or returned). */
export async function getCustomerBalance(customerId: string) {
  const balances = await getCustomerBalances([customerId]);
  return balances.get(customerId) ?? 0;
}

/** Batch version for list pages — 3 queries total instead of 3 per row. */
export async function getCustomerBalances(customerIds: string[]): Promise<Map<string, number>> {
  const balances = new Map<string, number>(customerIds.map((id) => [id, 0]));
  if (customerIds.length === 0) return balances;

  const [creditSales, repayments] = await Promise.all([
    prisma.sale.findMany({ where: { customerId: { in: customerIds }, paymentMethod: "CREDIT" }, select: { id: true, customerId: true, total: true } }),
    prisma.customerPayment.groupBy({ by: ["customerId"], where: { customerId: { in: customerIds } }, _sum: { amount: true } }),
  ]);
  for (const s of creditSales) {
    if (!s.customerId) continue;
    balances.set(s.customerId, (balances.get(s.customerId) ?? 0) + Number(s.total));
  }
  const saleIds = creditSales.map((s) => s.id);
  const saleCustomer = new Map(creditSales.map((s) => [s.id, s.customerId as string]));
  if (saleIds.length > 0) {
    const refunds = await prisma.refund.findMany({ where: { saleId: { in: saleIds } }, select: { saleId: true, amount: true } });
    for (const r of refunds) {
      const cid = saleCustomer.get(r.saleId);
      if (cid) balances.set(cid, (balances.get(cid) ?? 0) - Number(r.amount));
    }
  }
  for (const p of repayments) {
    if (!p.customerId) continue;
    balances.set(p.customerId, (balances.get(p.customerId) ?? 0) - Number(p._sum.amount ?? 0));
  }
  for (const [id, v] of balances) balances.set(id, Math.round(v * 100) / 100);
  return balances;
}
