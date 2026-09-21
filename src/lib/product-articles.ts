import type { Prisma } from "@/generated/prisma/client";
import { generateEan13 } from "@/lib/barcode";

type Tx = Prisma.TransactionClient;

interface OrderedValue {
  id: string;
  value: string;
}

/** Create one real Product for a single characteristic-value combination, linked to its article. */
export async function createVariantProduct(
  tx: Tx,
  opts: {
    storeId: string;
    articleId: string;
    articleName: string;
    articleCode: string;
    categoryId: string | null;
    categoryName: string | null;
    supplierId: string | null;
    orderedValues: OrderedValue[];
    costPrice: number;
    salePrice: number;
    barcode?: string;
    usedBarcodes: Set<string>;
  }
) {
  const label = opts.orderedValues.map((v) => v.value).join("/");

  let barcode = opts.barcode;
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!barcode || opts.usedBarcodes.has(barcode)) { barcode = generateEan13(); continue; }
    const clash = await tx.product.findFirst({ where: { barcode, storeId: opts.storeId } });
    if (!clash) break;
    barcode = generateEan13();
  }
  opts.usedBarcodes.add(barcode!);

  const product = await tx.product.create({
    data: {
      storeId: opts.storeId,
      name: `${opts.articleName}: ${label}`,
      sku: opts.articleCode,
      barcode,
      price: opts.salePrice,
      cost: opts.costPrice,
      categoryId: opts.categoryId,
      category: opts.categoryName,
      supplierId: opts.supplierId,
      articleId: opts.articleId,
    },
  });
  await tx.productVariantValue.createMany({
    data: opts.orderedValues.map((v) => ({ productId: product.id, valueId: v.id })),
  });
  return product;
}
