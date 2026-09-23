import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";

const schema = z.object({ countedQty: z.number().min(0) });

async function requireCounting(stocktakeId: string, storeId: string) {
  const stocktake = await prisma.stocktake.findFirst({ where: { id: stocktakeId, storeId }, select: { status: true } });
  if (!stocktake) return { error: NextResponse.json({ error: "Документ не найден" }, { status: 404 }) };
  if (stocktake.status !== "DRAFT" && stocktake.status !== "COUNTING") {
    return { error: NextResponse.json({ error: "На этом этапе нельзя изменять товары" }, { status: 409 }) };
  }
  return { error: null };
}

// PATCH /api/inventory/stocktakes/:id/items/:itemId — enter the counted quantity
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER", "WAREHOUSE"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: stocktakeId, itemId } = await params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { error } = await requireCounting(stocktakeId, await getStoreId());
  if (error) return error;

  const existingItem = await prisma.stocktakeItem.findFirst({ where: { id: itemId, stocktakeId } });
  if (!existingItem) return NextResponse.json({ error: "Строка не найдена" }, { status: 404 });

  const item = await prisma.stocktakeItem.update({
    where: { id: itemId },
    // Matches real UMAG: entering a count (manually or via a scan) stamps the
    // moment it happened — "Время сканирования" — and clears the unscanned warning.
    data: { countedQty: parsed.data.countedQty, difference: parsed.data.countedQty - Number(existingItem.expectedQty), scannedAt: new Date() },
  });
  return NextResponse.json({ item });
}

// DELETE /api/inventory/stocktakes/:id/items/:itemId
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER", "WAREHOUSE"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: stocktakeId, itemId } = await params;
  const { error } = await requireCounting(stocktakeId, await getStoreId());
  if (error) return error;

  const existingItem = await prisma.stocktakeItem.findFirst({ where: { id: itemId, stocktakeId } });
  if (!existingItem) return NextResponse.json({ error: "Строка не найдена" }, { status: 404 });

  await prisma.stocktakeItem.delete({ where: { id: itemId } });
  return NextResponse.json({ success: true });
}
