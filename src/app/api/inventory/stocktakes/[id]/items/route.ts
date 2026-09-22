import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";

const schema = z.object({ productId: z.string().min(1) });

// POST /api/inventory/stocktakes/:id/items — add a product to count (Подсчет).
// First item added flips a fresh DRAFT into COUNTING automatically.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER", "WAREHOUSE"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: stocktakeId } = await params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const storeId = await getStoreId();
  const stocktake = await prisma.stocktake.findFirst({ where: { id: stocktakeId, storeId }, select: { status: true } });
  if (!stocktake) return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
  if (stocktake.status !== "DRAFT" && stocktake.status !== "COUNTING") {
    return NextResponse.json({ error: "На этом этапе нельзя добавлять товары" }, { status: 409 });
  }

  const product = await prisma.product.findFirst({ where: { id: parsed.data.productId, storeId, deletedAt: null }, select: { stock: true } });
  if (!product) return NextResponse.json({ error: "Товар не найден" }, { status: 404 });

  const already = await prisma.stocktakeItem.findFirst({ where: { stocktakeId, productId: parsed.data.productId } });
  if (already) return NextResponse.json({ error: "Товар уже добавлен в этот подсчёт" }, { status: 409 });

  const expectedQty = Number(product.stock);
  const [item] = await prisma.$transaction([
    prisma.stocktakeItem.create({
      data: { stocktakeId, productId: parsed.data.productId, expectedQty, countedQty: expectedQty, difference: 0 },
    }),
    ...(stocktake.status === "DRAFT" ? [prisma.stocktake.update({ where: { id: stocktakeId }, data: { status: "COUNTING" } })] : []),
  ]);
  return NextResponse.json({ item }, { status: 201 });
}
