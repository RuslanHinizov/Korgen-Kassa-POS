import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { applyInventoryMovement } from "@/lib/inventory-ledger";
import { resolveStockLines } from "@/lib/bundle";
import { logAudit } from "@/lib/audit";

// POST /api/customer-returns/:id/post — Провести: restores stock for each line
// (the customer physically returned the goods) and locks the document; the
// resulting debt is then settled over time via /payments.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const storeId = await getStoreId();

  const customerReturn = await prisma.customerReturn.findFirst({ where: { id, storeId }, include: { items: true } });
  if (!customerReturn) return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
  if (customerReturn.status === "POSTED") return NextResponse.json({ error: "Документ уже проведён" }, { status: 409 });
  if (customerReturn.items.length === 0) return NextResponse.json({ error: "Добавьте хотя бы один товар" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const posted = await prisma.$transaction(async (tx: any) => {
    for (const item of customerReturn.items) {
      if (!item.productId) continue;
      const lines = await resolveStockLines(tx, item.productId, Number(item.quantity));
      for (const line of lines) {
        await applyInventoryMovement(tx, {
          productId: line.productId,
          userId: session.user.id,
          type: "SALE_RETURN",
          quantity: line.quantity,
          referenceType: "CustomerReturn",
          referenceId: customerReturn.id,
          documentNo: String(customerReturn.documentNo),
          note: customerReturn.comment ?? undefined,
        });
      }
    }
    return tx.customerReturn.update({ where: { id }, data: { status: "POSTED", postedAt: new Date() } });
  });

  await logAudit({ userId: session.user.id, action: "CUSTOMER_RETURN_POST", entityType: "CustomerReturn", entityId: id, details: { documentNo: customerReturn.documentNo, items: customerReturn.items.length, totalAmount: Number(customerReturn.totalAmount) } });
  return NextResponse.json({ customerReturn: posted });
}
