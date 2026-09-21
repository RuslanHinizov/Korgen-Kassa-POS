import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { getStoreId } from "@/lib/store-context";
import { logAudit } from "@/lib/audit";
import { applyInventoryMovement } from "@/lib/inventory-ledger";

const adjustSchema = z.object({
  productId: z.string(),
  delta: z.number().refine((value) => value !== 0, "Delta must not be zero"),
  reason: z.enum(["RECEIVED", "DAMAGED", "THEFT", "CORRECTION", "OPENING_COUNT"]),
  note: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = adjustSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { productId, delta, reason, note } = parsed.data;
  const storeId = await getStoreId();
  const product = await prisma.product.findFirst({ where: { id: productId, storeId, deletedAt: null } });
  if (!product) return NextResponse.json({ error: "Товар не найден" }, { status: 404 });

  const adjustment = await prisma.$transaction(async (tx) => {
    const created = await tx.stockAdjustment.create({ data: { productId, userId: session.user.id, delta, reason, note } });
    const type = reason === "RECEIVED" ? "RECEIPT" : reason === "DAMAGED" ? "DAMAGE" : reason === "THEFT" ? "THEFT" : reason === "OPENING_COUNT" ? "OPENING_BALANCE" : "ADJUSTMENT";
    await applyInventoryMovement(tx, { productId, userId: session.user.id, type, quantity: delta, referenceType: "StockAdjustment", referenceId: created.id, note });
    return created;
  });

  await logAudit({
    userId: session.user.id,
    action: "STOCK_ADJUST",
    entityType: "Product",
    entityId: productId,
    details: { delta, reason, note: note ?? null },
  });

  return NextResponse.json({ adjustment });
}

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const productId = req.nextUrl.searchParams.get("productId");
  const storeId = await getStoreId();

  const adjustments = await prisma.stockAdjustment.findMany({
    where: { product: { storeId }, ...(productId ? { productId } : {}) },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ adjustments });
}
