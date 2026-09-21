import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(1).max(200),
  unit: z.enum(["pcs", "kg", "l", "m"]).default("pcs"),
  barcode: z.string().min(1),
  additionalCode: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  components: z.array(z.object({ productId: z.string().min(1), quantity: z.number().positive() })).min(1),
  extraCost: z.number().min(0).default(0),
  price: z.number().min(0),
  wholesalePrice: z.number().min(0).optional().nullable(),
});

// GET /api/products/bundle/[id]
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const storeId = await getStoreId();
  const bundle = await prisma.product.findFirst({
    where: { id, storeId, productType: "BUNDLE" },
    include: { bundleComponents: { include: { component: { select: { id: true, name: true, barcode: true, unit: true, cost: true, price: true } } } } },
  });
  if (!bundle) return NextResponse.json({ error: "Комплект не найден" }, { status: 404 });

  return NextResponse.json({
    product: {
      id: bundle.id, name: bundle.name, unit: bundle.unit, barcode: bundle.barcode, additionalCode: bundle.additionalCode,
      categoryId: bundle.categoryId, price: Number(bundle.price), wholesalePrice: bundle.wholesalePrice != null ? Number(bundle.wholesalePrice) : null,
      extraCost: bundle.bundleExtraCost != null ? Number(bundle.bundleExtraCost) : 0, cost: bundle.cost != null ? Number(bundle.cost) : 0,
      components: bundle.bundleComponents.map((bi) => ({
        productId: bi.componentId, quantity: Number(bi.quantity), name: bi.component.name, barcode: bi.component.barcode,
        unit: bi.component.unit, cost: Number(bi.component.cost ?? 0), price: Number(bi.component.price),
      })),
    },
  });
}

// PATCH /api/products/bundle/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const storeId = await getStoreId();
  const existing = await prisma.product.findFirst({ where: { id, storeId, productType: "BUNDLE" }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Комплект не найден" }, { status: 404 });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  const components = await prisma.product.findMany({
    where: { id: { in: d.components.map((c) => c.productId) }, storeId, productType: "REGULAR", deletedAt: null },
    select: { id: true, cost: true },
  });
  if (components.length !== d.components.length) {
    return NextResponse.json({ error: "Один или несколько товаров недоступны для комплекта" }, { status: 400 });
  }
  const costById = new Map(components.map((c) => [c.id, Number(c.cost ?? 0)]));
  const cost = d.components.reduce((sum, c) => sum + costById.get(c.productId)! * c.quantity, 0) + d.extraCost;

  const clash = await prisma.product.findFirst({ where: { barcode: d.barcode.trim(), storeId, id: { not: id } } });
  if (clash) return NextResponse.json({ error: "Такой штрихкод уже используется" }, { status: 409 });

  const category = d.categoryId ? await prisma.category.findFirst({ where: { id: d.categoryId, storeId }, select: { name: true } }) : null;

  await prisma.$transaction([
    prisma.bundleItem.deleteMany({ where: { bundleId: id } }),
    prisma.product.update({
      where: { id },
      data: {
        name: d.name.trim(), unit: d.unit, barcode: d.barcode.trim(), additionalCode: d.additionalCode || null,
        categoryId: category ? d.categoryId : null, category: category?.name ?? null,
        cost, price: d.price, wholesalePrice: d.wholesalePrice ?? null, bundleExtraCost: d.extraCost,
        bundleComponents: { create: d.components.map((c) => ({ componentId: c.productId, quantity: c.quantity })) },
      },
    }),
  ]);
  return NextResponse.json({ success: true });
}
