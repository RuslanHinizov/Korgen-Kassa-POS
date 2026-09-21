import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { applyInventoryMovement } from "@/lib/inventory-ledger";
import { logAudit } from "@/lib/audit";

// Причина списания → InventoryMovementType (WASTE covers "просрочено" and "кухня" — no dedicated ledger type for either).
const REASON_TO_MOVEMENT: Record<string, "DAMAGE" | "WASTE" | "THEFT" | "ADJUSTMENT"> = {
  DAMAGED: "DAMAGE",
  EXPIRED: "WASTE",
  KITCHEN: "WASTE",
  OTHER: "ADJUSTMENT",
};

// POST /api/write-offs/:id/post — Провести: decrements stock + writes an inventory
// ledger row per line, then locks the document (no further edits).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const storeId = await getStoreId();

  const writeOff = await prisma.writeOff.findFirst({ where: { id, storeId }, include: { items: true } });
  if (!writeOff) return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
  if (writeOff.status === "POSTED") return NextResponse.json({ error: "Документ уже проведён" }, { status: 409 });
  if (writeOff.items.length === 0) return NextResponse.json({ error: "Добавьте хотя бы один товар" }, { status: 400 });

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const posted = await prisma.$transaction(async (tx: any) => {
      for (const item of writeOff.items) {
        await applyInventoryMovement(tx, {
          productId: item.productId,
          userId: session.user.id,
          type: REASON_TO_MOVEMENT[item.reason] ?? "ADJUSTMENT",
          quantity: -Number(item.quantity),
          unitCost: item.unitCost ? Number(item.unitCost) : undefined,
          referenceType: "WriteOff",
          referenceId: writeOff.id,
          documentNo: String(writeOff.documentNo),
          note: item.note ?? writeOff.note ?? undefined,
        });
      }
      return tx.writeOff.update({ where: { id }, data: { status: "POSTED", postedAt: new Date() } });
    });

    await logAudit({ userId: session.user.id, action: "WRITE_OFF_POST", entityType: "WriteOff", entityId: id, details: { documentNo: writeOff.documentNo, items: writeOff.items.length, totalCost: Number(writeOff.totalCost) } });
    return NextResponse.json({ writeOff: posted });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "INSUFFICIENT_STOCK") {
      return NextResponse.json({ error: "Недостаточно остатка по одному из товаров" }, { status: 409 });
    }
    throw e;
  }
}
