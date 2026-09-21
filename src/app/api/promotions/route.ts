import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";

const promoSchema = z.object({
  name: z.string().min(1).max(120),
  type: z.enum(["PERCENT_OFF", "AMOUNT_OFF", "BUY_X_GET_Y", "BUNDLE_PRICE"]),
  active: z.boolean().default(true),
  priority: z.number().int().default(0),
  scope: z.enum(["cart", "category", "product"]).default("cart"),
  categoryId: z.string().optional().nullable(),
  productId: z.string().optional().nullable(),
  percent: z.number().min(0).max(100).optional().nullable(),
  amount: z.number().min(0).optional().nullable(),
  buyQty: z.number().int().min(1).optional().nullable(),
  getQty: z.number().int().min(1).optional().nullable(),
  getPercent: z.number().min(0).max(100).optional().nullable(),
  minSubtotal: z.number().min(0).optional().nullable(),
  startsAt: z.coerce.date().optional().nullable(),
  endsAt: z.coerce.date().optional().nullable(),
  daysOfWeek: z.string().regex(/^[1-7](,[1-7])*$/).optional().nullable(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  bundleItems: z.array(z.object({ productId: z.string(), quantity: z.number().int().min(1) })).optional(),
});

async function requirePrivileged() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) return null;
  return session;
}

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const storeId = await getStoreId();
  const promotions = await prisma.promotion.findMany({
    where: { storeId },
    orderBy: [{ active: "desc" }, { priority: "desc" }, { createdAt: "desc" }],
    include: {
      category: { select: { name: true } },
      product: { select: { name: true } },
      bundleItems: { include: { product: { select: { name: true } } } },
    },
  });
  return NextResponse.json({ promotions });
}

export async function POST(req: NextRequest) {
  const session = await requirePrivileged();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = promoSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { bundleItems, ...d } = parsed.data;
  const storeId = await getStoreId();

  if (d.scope === "category" && d.categoryId) {
    const category = await prisma.category.findFirst({ where: { id: d.categoryId, storeId } });
    if (!category) return NextResponse.json({ error: "Категория не найдена" }, { status: 404 });
  }
  if (d.scope === "product" && d.productId) {
    const product = await prisma.product.findFirst({ where: { id: d.productId, storeId, deletedAt: null } });
    if (!product) return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
  }
  if (bundleItems && bundleItems.length > 0) {
    const count = await prisma.product.count({ where: { id: { in: bundleItems.map((b) => b.productId) }, storeId, deletedAt: null } });
    if (count !== new Set(bundleItems.map((b) => b.productId)).size) {
      return NextResponse.json({ error: "Один или несколько товаров недоступны" }, { status: 400 });
    }
  }

  const promotion = await prisma.promotion.create({
    data: {
      ...d,
      storeId,
      categoryId: d.scope === "category" ? d.categoryId || null : null,
      productId: d.scope === "product" ? d.productId || null : null,
      bundleItems: bundleItems && d.type === "BUNDLE_PRICE" ? { create: bundleItems } : undefined,
    },
  });
  return NextResponse.json({ promotion }, { status: 201 });
}
