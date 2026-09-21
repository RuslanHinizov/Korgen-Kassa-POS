import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { generateEan13 } from "@/lib/barcode";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(1).max(200),
  unit: z.enum(["pcs", "kg", "l", "m"]).default("pcs"),
  barcode: z.string().optional().nullable(),
  additionalCode: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  price: z.number().min(0),
});

// POST /api/products/service — Товары → "+ Услуга"
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;
  const storeId = await getStoreId();

  let barcode = d.barcode?.trim() || generateEan13();
  for (let attempt = 0; attempt < 20; attempt++) {
    const clash = await prisma.product.findFirst({ where: { barcode, storeId } });
    if (!clash) break;
    barcode = generateEan13();
  }

  const category = d.categoryId ? await prisma.category.findFirst({ where: { id: d.categoryId, storeId }, select: { name: true } }) : null;

  const service = await prisma.product.create({
    data: {
      storeId, name: d.name.trim(), unit: d.unit, barcode, additionalCode: d.additionalCode || null,
      categoryId: category ? d.categoryId : null, category: category?.name ?? null,
      productType: "SERVICE", cost: null, price: d.price,
    },
  });
  return NextResponse.json({ product: service }, { status: 201 });
}
