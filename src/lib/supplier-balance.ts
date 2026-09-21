import { prisma } from "@/lib/db";

/** What we still owe this supplier: unpaid Приёмки minus unpaid Возвраты owed back to us. */
export async function getSupplierBalance(supplierId: string) {
  const [receipts, receiptPayments, returns, returnPayments] = await Promise.all([
    prisma.purchaseReceipt.aggregate({ where: { supplierId, status: "POSTED" }, _sum: { totalAmount: true } }),
    prisma.purchaseReceiptPayment.aggregate({ where: { receipt: { supplierId, status: "POSTED" } }, _sum: { amount: true } }),
    prisma.supplierReturn.aggregate({ where: { supplierId, status: "POSTED" }, _sum: { totalAmount: true } }),
    prisma.supplierReturnPayment.aggregate({ where: { return: { supplierId, status: "POSTED" } }, _sum: { amount: true } }),
  ]);
  const owed = Number(receipts._sum.totalAmount ?? 0) - Number(receiptPayments._sum.amount ?? 0);
  const owedBack = Number(returns._sum.totalAmount ?? 0) - Number(returnPayments._sum.amount ?? 0);
  return Math.round((owed - owedBack) * 100) / 100;
}
