import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";

const schema = z.object({ categoryId: z.string().min(1) });

// POST /api/inventory/stocktakes/:id/items/bulk — add every active product in a
// category (and its subcategories) to the count at once, the "zone" equivalent
// of a physical inventory count. Skips products already in the document.
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

  const rootCategory = await prisma.category.findFirst({ where: { id: parsed.data.categoryId, storeId }, select: { id: true } });
  if (!rootCategory) return NextResponse.json({ error: "Категория не найдена" }, { status: 404 });

  // Walk the category tree to include subcategories.
  const categoryIds = [rootCategory.id];
  let frontier = [rootCategory.id];
  while (frontier.length > 0) {
    const children = await prisma.category.findMany({ where: { storeId, parentId: { in: frontier } }, select: { id: true } });
    frontier = children.map((c) => c.id);
    categoryIds.push(...frontier);
  }

  const existingIds = new Set(
    (await prisma.stocktakeItem.findMany({ where: { stocktakeId }, select: { productId: true } })).map((i) => i.productId)
  );
  const products = await prisma.product.findMany({
    where: { storeId, deletedAt: null, categoryId: { in: categoryIds }, id: { notIn: [...existingIds] } },
    select: { id: true, stock: true },
  });

  if (products.length === 0) return NextResponse.json({ added: 0 });

  await prisma.$transaction([
    prisma.stocktakeItem.createMany({
      data: products.map((p) => ({
        stocktakeId, productId: p.id, expectedQty: p.stock, countedQty: null, difference: null,
      })),
    }),
    ...(stocktake.status === "DRAFT" ? [prisma.stocktake.update({ where: { id: stocktakeId }, data: { status: "COUNTING" as const } })] : []),
  ]);

  return NextResponse.json({ added: products.length });
}
