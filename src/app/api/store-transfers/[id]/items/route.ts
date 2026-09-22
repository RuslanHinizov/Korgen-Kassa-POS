import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";

const schema = z.object({ productId: z.string().min(1), quantity: z.number().positive() });

function lineTotal(quantity: number, unitCost: number) {
  return quantity * unitCost;
}

async function recomputeTotal(transferId: string) {
  const items = await prisma.storeTransferItem.findMany({ where: { transferId }, select: { total: true } });
  const total = items.reduce((s, i) => s + Number(i.total), 0);
  await prisma.storeTransfer.update({ where: { id: transferId }, data: { totalAmount: total } });
}

// POST /api/store-transfers/:id/items — add a line from the source store's own catalog to a still-draft document
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER", "WAREHOUSE"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: transferId } = await params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const storeId = await getStoreId();
  const transfer = await prisma.storeTransfer.findFirst({ where: { id: transferId, storeId }, select: { status: true } });
  if (!transfer) return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
  if (transfer.status === "POSTED") return NextResponse.json({ error: "Проведённый документ нельзя изменить" }, { status: 409 });

  const product = await prisma.product.findFirst({ where: { id: parsed.data.productId, storeId, deletedAt: null }, select: { cost: true, price: true } });
  if (!product) return NextResponse.json({ error: "Товар не найден" }, { status: 404 });

  const settings = await prisma.businessSettings.findUnique({ where: { storeId }, select: { mergeSameProducts: true } });
  const shouldMerge = settings?.mergeSameProducts !== false;
  const existing = shouldMerge ? await prisma.storeTransferItem.findFirst({ where: { transferId, productId: parsed.data.productId } }) : null;
  const unitCost = Number(product.cost ?? product.price);
  const item = existing
    ? await prisma.storeTransferItem.update({
        where: { id: existing.id },
        data: { quantity: Number(existing.quantity) + parsed.data.quantity, total: lineTotal(Number(existing.quantity) + parsed.data.quantity, unitCost) },
      })
    : await prisma.storeTransferItem.create({
        data: { transferId, productId: parsed.data.productId, quantity: parsed.data.quantity, unitCost, total: lineTotal(parsed.data.quantity, unitCost) },
      });
  await recomputeTotal(transferId);
  return NextResponse.json({ item }, { status: 201 });
}
