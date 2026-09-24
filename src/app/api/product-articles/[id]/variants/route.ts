import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";
import { createVariantProduct } from "@/lib/product-articles";

const variantSchema = z.object({
  valueIds: z.array(z.string().min(1)).min(1),
  barcode: z.string().trim().min(1).optional(),
  costPrice: z.number().min(0).default(0),
  salePrice: z.number().min(0).default(0),
});

const bodySchema = z.object({
  characteristicIds: z.array(z.string().min(1)).min(1),
  variants: z.array(variantSchema).min(1),
});

// POST /api/product-articles/:id/variants — "Обновить таблицу": link any newly
// introduced characteristics and create Products only for combinations that
// don't already exist yet (existing rows and their prices are left untouched).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const storeId = await getStoreId();
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;

  const article = await prisma.productArticle.findFirst({
    where: { id, storeId },
    include: { characteristics: true, products: { where: { deletedAt: null }, include: { variantValues: true } } },
  });
  if (!article) return NextResponse.json({ error: "Не найдено" }, { status: 404 });

  const allValueIds = [...new Set(data.variants.flatMap((v) => v.valueIds))];
  const values = await prisma.productCharacteristicValue.findMany({ where: { id: { in: allValueIds }, characteristic: { storeId } } });
  const valueById = new Map(values.map((v) => [v.id, v]));
  if (values.length !== allValueIds.length) return NextResponse.json({ error: "Значение характеристики не найдено" }, { status: 400 });

  const ownCharacteristics = await prisma.productCharacteristic.count({ where: { id: { in: data.characteristicIds }, storeId } });
  if (ownCharacteristics !== new Set(data.characteristicIds).size) return NextResponse.json({ error: "Характеристика не найдена" }, { status: 400 });

  const existingCombos = new Set(
    article.products.map((p) => p.variantValues.map((vv) => vv.valueId).sort().join(","))
  );
  const linkedCharacteristicIds = new Set(article.characteristics.map((c) => c.characteristicId));
  const newCharacteristicIds = data.characteristicIds.filter((cid) => !linkedCharacteristicIds.has(cid));

  const usedBarcodes = new Set<string>();
  const created = await prisma.$transaction(async (tx) => {
    if (newCharacteristicIds.length > 0) {
      const maxSort = article.characteristics.reduce((m, c) => Math.max(m, c.sortOrder), -1);
      await tx.productArticleCharacteristic.createMany({
        data: newCharacteristicIds.map((characteristicId, i) => ({ articleId: id, characteristicId, sortOrder: maxSort + 1 + i })),
      });
    }

    const createdProducts = [];
    for (const variant of data.variants) {
      const combo = [...variant.valueIds].sort().join(",");
      if (existingCombos.has(combo)) continue;

      const orderedValues = data.characteristicIds
        .map((cid) => variant.valueIds.map((vid) => valueById.get(vid)!).find((v) => v.characteristicId === cid))
        .filter((v): v is NonNullable<typeof v> => Boolean(v));

      const product = await createVariantProduct(tx, {
        storeId,
        articleId: id,
        articleName: article.name,
        articleCode: article.code,
        categoryId: article.categoryId,
        categoryName: article.categoryId ? (await tx.category.findUnique({ where: { id: article.categoryId } }))?.name ?? null : null,
        supplierId: article.supplierId,
        orderedValues,
        costPrice: variant.costPrice,
        salePrice: variant.salePrice,
        barcode: variant.barcode,
        usedBarcodes,
      });
      createdProducts.push(product);
    }
    return createdProducts;
  });

  return NextResponse.json({ created: created.length });
}
