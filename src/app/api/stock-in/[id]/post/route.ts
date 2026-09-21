import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { applyInventoryMovement } from "@/lib/inventory-ledger";
import { logAudit } from "@/lib/audit";

// POST /api/stock-in/:id/post — Провести: increases stock for each line and
// writes an inventory ledger row. The catalog cost/price was already synced
// live when each line's Цена was confirmed, so posting only moves stock.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const storeId = await getStoreId();

  const stockIn = await prisma.stockIn.findFirst({ where: { id, storeId }, include: { items: true } });
  if (!stockIn) return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
  if (stockIn.status !== "DRAFT") return NextResponse.json({ error: "Документ уже проведён или удалён" }, { status: 409 });
  if (stockIn.items.length === 0) return NextResponse.json({ error: "Добавьте хотя бы один товар" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const posted = await prisma.$transaction(async (tx: any) => {
    for (const item of stockIn.items) {
      await applyInventoryMovement(tx, {
        productId: item.productId,
        userId: session.user.id,
        type: "RECEIPT",
        quantity: Number(item.quantity),
        unitCost: item.unitCost ? Number(item.unitCost) : undefined,
        referenceType: "StockIn",
        referenceId: stockIn.id,
        documentNo: String(stockIn.documentNo),
        note: item.note ?? stockIn.note ?? undefined,
      });
    }
    return tx.stockIn.update({ where: { id }, data: { status: "POSTED", postedAt: new Date() } });
  });

  await logAudit({ userId: session.user.id, action: "STOCK_IN_POST", entityType: "StockIn", entityId: id, details: { documentNo: stockIn.documentNo, items: stockIn.items.length, totalCost: Number(stockIn.totalCost) } });
  return NextResponse.json({ stockIn: posted });
}
