import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";

// GET /api/product-articles/:id — full detail for the edit page
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const storeId = await getStoreId();

  const article = await prisma.productArticle.findFirst({
    where: { id, storeId },
    include: {
      category: { select: { id: true, name: true } },
      supplier: { select: { id: true, name: true } },
      characteristics: { orderBy: { sortOrder: "asc" }, include: { characteristic: true } },
      products: {
        orderBy: { createdAt: "asc" },
        include: { variantValues: { include: { value: true } } },
      },
    },
  });
  if (!article) return NextResponse.json({ error: "Не найдено" }, { status: 404 });

  // Values actually in use per characteristic, in first-seen (creation) order.
  const usedValuesByCharacteristic = new Map<string, Map<string, { id: string; value: string; createdAt: Date }>>();
  for (const p of article.products) {
    for (const vv of p.variantValues) {
      const cid = vv.value.characteristicId;
      if (!usedValuesByCharacteristic.has(cid)) usedValuesByCharacteristic.set(cid, new Map());
      usedValuesByCharacteristic.get(cid)!.set(vv.value.id, { id: vv.value.id, value: vv.value.value, createdAt: vv.value.createdAt });
    }
  }

  return NextResponse.json({
    article: {
      id: article.id,
      name: article.name,
      code: article.code,
      categoryId: article.categoryId,
      categoryName: article.category?.name ?? null,
      supplierId: article.supplierId,
      supplierName: article.supplier?.name ?? null,
      characteristics: article.characteristics.map((ac) => ({
        characteristicId: ac.characteristicId,
        name: ac.characteristic.name,
        values: [...(usedValuesByCharacteristic.get(ac.characteristicId)?.values() ?? [])]
          .sort((a, b) => +a.createdAt - +b.createdAt)
          .map((v) => ({ id: v.id, value: v.value })),
      })),
      products: article.products.map((p) => {
        const cost = Number(p.cost ?? 0);
        const price = Number(p.price);
        return {
          id: p.id,
          name: p.name,
          barcode: p.barcode,
          costPrice: cost,
          salePrice: price,
          markup: cost > 0 ? Math.round(((price - cost) / cost) * 1000) / 10 : 0,
          valueIds: p.variantValues.map((vv) => vv.valueId),
        };
      }),
    },
  });
}

const patchSchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  categoryId: z.string().min(1).nullable().optional(),
  supplierId: z.string().min(1).nullable().optional(),
});

// PATCH /api/product-articles/:id — header fields only (name / category / supplier)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const storeId = await getStoreId();
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const existing = await prisma.productArticle.findFirst({ where: { id, storeId } });
  if (!existing) return NextResponse.json({ error: "Не найдено" }, { status: 404 });

  let categoryUpdate: { categoryId?: string | null } = {};
  if (parsed.data.categoryId !== undefined) {
    const cat = parsed.data.categoryId ? await prisma.category.findFirst({ where: { id: parsed.data.categoryId, storeId } }) : null;
    categoryUpdate = { categoryId: parsed.data.categoryId || null };
    // Keep every generated product's own category in sync too.
    await prisma.product.updateMany({ where: { articleId: id }, data: { categoryId: cat?.id ?? null, category: cat?.name ?? null } });
  }

  if (parsed.data.supplierId !== undefined) {
    await prisma.product.updateMany({ where: { articleId: id }, data: { supplierId: parsed.data.supplierId || null } });
  }

  const article = await prisma.productArticle.update({
    where: { id },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...categoryUpdate,
      ...(parsed.data.supplierId !== undefined ? { supplierId: parsed.data.supplierId || null } : {}),
    },
  });
  return NextResponse.json({ article });
}

// DELETE /api/product-articles/:id — ungroup: the article record is removed but its
// generated products are kept as ordinary standalone products (never bulk-deletes
// real inventory/sales history from here).
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const storeId = await getStoreId();
  const existing = await prisma.productArticle.findFirst({ where: { id, storeId } });
  if (!existing) return NextResponse.json({ error: "Не найдено" }, { status: 404 });

  await prisma.productArticle.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
