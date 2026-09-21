import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";
import { createVariantProduct } from "@/lib/product-articles";

// GET /api/product-articles?q=&page=&pageSize= — Артикулы list
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim();
  const page = Math.max(1, Number(sp.get("page") ?? 1));
  const pageSize = Math.min(500, Math.max(1, Number(sp.get("pageSize") ?? 25)));

  const storeId = await getStoreId();
  const where = {
    storeId,
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { code: { contains: q, mode: "insensitive" as const } }] } : {}),
  };

  const [total, articles] = await Promise.all([
    prisma.productArticle.count({ where }),
    prisma.productArticle.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { _count: { select: { products: { where: { deletedAt: null } }, characteristics: true } } },
    }),
  ]);

  return NextResponse.json({
    articles: articles.map((a) => ({
      id: a.id, name: a.name, code: a.code,
      productCount: a._count.products, characteristicCount: a._count.characteristics,
    })),
    total,
  });
}

const variantSchema = z.object({
  valueIds: z.array(z.string().min(1)).min(1),
  barcode: z.string().trim().min(1).optional(),
  costPrice: z.number().min(0).default(0),
  salePrice: z.number().min(0).default(0),
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(50),
  code: z.string().trim().min(1).max(60),
  characteristicIds: z.array(z.string().min(1)).min(1),
  variants: z.array(variantSchema).min(1),
  categoryId: z.string().min(1).nullable().optional(),
  supplierId: z.string().min(1).nullable().optional(),
});

// POST /api/product-articles — create the article + one real Product per variant row
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;
  const storeId = await getStoreId();

  const codeTaken = await prisma.productArticle.findFirst({ where: { code: data.code, storeId } });
  if (codeTaken) return NextResponse.json({ error: "Артикул с таким кодом уже существует" }, { status: 409 });

  const characteristics = await prisma.productCharacteristic.findMany({ where: { id: { in: data.characteristicIds } } });
  if (characteristics.length !== data.characteristicIds.length) {
    return NextResponse.json({ error: "Характеристика не найдена" }, { status: 400 });
  }
  const allValueIds = [...new Set(data.variants.flatMap((v) => v.valueIds))];
  const values = await prisma.productCharacteristicValue.findMany({ where: { id: { in: allValueIds } } });
  const valueById = new Map(values.map((v) => [v.id, v]));
  if (values.length !== allValueIds.length) return NextResponse.json({ error: "Значение характеристики не найдено" }, { status: 400 });

  let category: { id: string; name: string } | null = null;
  if (data.categoryId) {
    category = await prisma.category.findFirst({ where: { id: data.categoryId, storeId }, select: { id: true, name: true } });
  }

  const usedBarcodes = new Set<string>();

  const article = await prisma.$transaction(async (tx) => {
    const createdArticle = await tx.productArticle.create({
      data: { storeId, name: data.name, code: data.code, categoryId: category?.id ?? null, supplierId: data.supplierId || null },
    });

    await tx.productArticleCharacteristic.createMany({
      data: data.characteristicIds.map((characteristicId, index) => ({ articleId: createdArticle.id, characteristicId, sortOrder: index })),
    });

    for (const variant of data.variants) {
      // Preserve the characteristic order chosen for the article in the generated name/label.
      const orderedValues = data.characteristicIds
        .map((cid) => variant.valueIds.map((vid) => valueById.get(vid)!).find((v) => v.characteristicId === cid))
        .filter((v): v is NonNullable<typeof v> => Boolean(v));

      await createVariantProduct(tx, {
        storeId,
        articleId: createdArticle.id,
        articleName: data.name,
        articleCode: data.code,
        categoryId: category?.id ?? null,
        categoryName: category?.name ?? null,
        supplierId: data.supplierId || null,
        orderedValues,
        costPrice: variant.costPrice,
        salePrice: variant.salePrice,
        barcode: variant.barcode,
        usedBarcodes,
      });
    }

    return createdArticle;
  });

  return NextResponse.json({ article }, { status: 201 });
}
