import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { applyInventoryMovement } from "@/lib/inventory-ledger";
import { logAudit } from "@/lib/audit";

// POST /api/supplier-returns/:id/post — Провести: decreases stock for each line
// (goods physically sent back to the supplier) and locks the document; the
// resulting refund owed to us is then settled over time via /payments.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const storeId = await getStoreId();

  const supplierReturn = await prisma.supplierReturn.findFirst({ where: { id, storeId }, include: { items: true } });
  if (!supplierReturn) return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
  if (supplierReturn.status === "POSTED") return NextResponse.json({ error: "Документ уже проведён" }, { status: 409 });
  if (!supplierReturn.supplierId) return NextResponse.json({ error: "Выберите поставщика" }, { status: 400 });
  if (supplierReturn.items.length === 0) return NextResponse.json({ error: "Добавьте хотя бы один товар" }, { status: 400 });

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const posted = await prisma.$transaction(async (tx: any) => {
      for (const item of supplierReturn.items) {
        if (!item.productId) continue;
        await applyInventoryMovement(tx, {
          productId: item.productId,
          userId: session.user.id,
          supplierId: supplierReturn.supplierId,
          type: "SUPPLIER_RETURN",
          quantity: -Number(item.quantity),
          unitCost: Number(item.price),
          referenceType: "SupplierReturn",
          referenceId: supplierReturn.id,
          documentNo: String(supplierReturn.documentNo),
          note: supplierReturn.comment ?? undefined,
        });
      }
      return tx.supplierReturn.update({ where: { id }, data: { status: "POSTED", postedAt: new Date() } });
    });

    await logAudit({ userId: session.user.id, action: "SUPPLIER_RETURN_POST", entityType: "SupplierReturn", entityId: id, details: { documentNo: supplierReturn.documentNo, items: supplierReturn.items.length, totalAmount: Number(supplierReturn.totalAmount) } });
    return NextResponse.json({ supplierReturn: posted });
  } catch (e) {
    if (e instanceof Error && e.message === "INSUFFICIENT_STOCK") {
      return NextResponse.json({ error: "Недостаточно остатка для возврата" }, { status: 409 });
    }
    throw e;
  }
}
