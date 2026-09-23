import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { applyInventoryMovement } from "@/lib/inventory-ledger";
import { logAudit } from "@/lib/audit";

// POST /api/inventory/stocktakes/:id/post — Провести: Черновик/Подсчёт → Проведён.
// Matches real UMAG: no separate review stage — Провести works directly, even if
// some lines were never actually scanned (still 0/flagged) — the human is trusted
// to have seen the warning. Applies each line's difference to stock, writes an
// inventory ledger row, then locks the document.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER", "WAREHOUSE"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const storeId = await getStoreId();

  const stocktake = await prisma.stocktake.findFirst({ where: { id, storeId }, include: { items: { include: { product: { select: { cost: true, price: true } } } } } });
  if (!stocktake) return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
  if (stocktake.status !== "DRAFT" && stocktake.status !== "COUNTING") {
    return NextResponse.json({ error: "Документ уже проведён или отменён" }, { status: 409 });
  }
  if (stocktake.items.length === 0) return NextResponse.json({ error: "Добавьте хотя бы один товар" }, { status: 400 });

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const posted = await prisma.$transaction(async (tx: any) => {
      for (const item of stocktake.items) {
        const delta = Number(item.difference);
        if (delta !== 0) {
          await applyInventoryMovement(tx, {
            productId: item.productId,
            userId: session.user.id,
            type: "STOCKTAKE",
            quantity: delta,
            unitCost: stocktake.valuateAtCost ? Number(item.product.cost ?? item.product.price) : Number(item.product.price),
            referenceType: "Stocktake",
            referenceId: stocktake.id,
            documentNo: String(stocktake.documentNo),
            note: stocktake.note ?? undefined,
          });
        }
      }
      return tx.stocktake.update({ where: { id }, data: { status: "POSTED", postedAt: new Date() } });
    });

    await logAudit({ userId: session.user.id, action: "STOCKTAKE_POST", entityType: "Stocktake", entityId: id, details: { items: stocktake.items.length } });
    return NextResponse.json({ stocktake: posted });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "INSUFFICIENT_STOCK") {
      return NextResponse.json({ error: "Недостаточно остатка по одному из товаров" }, { status: 409 });
    }
    throw e;
  }
}
