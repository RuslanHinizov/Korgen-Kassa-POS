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
  price: z.number().min(0),
});

// GET /api/products/service/[id]
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const storeId = await getStoreId();
  const service = await prisma.product.findFirst({ where: { id, storeId, productType: "SERVICE" } });
  if (!service) return NextResponse.json({ error: "Услуга не найдена" }, { status: 404 });
  return NextResponse.json({
    product: {
      id: service.id, name: service.name, unit: service.unit, barcode: service.barcode,
      additionalCode: service.additionalCode, categoryId: service.categoryId, price: Number(service.price),
    },
  });
}

// PATCH /api/products/service/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const storeId = await getStoreId();
  const existing = await prisma.product.findFirst({ where: { id, storeId, productType: "SERVICE" }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Услуга не найдена" }, { status: 404 });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  const clash = await prisma.product.findFirst({ where: { barcode: d.barcode.trim(), storeId, id: { not: id } }, select: { id: true } });
  if (clash) return NextResponse.json({ error: "Такой штрихкод уже используется" }, { status: 409 });

  const category = d.categoryId ? await prisma.category.findFirst({ where: { id: d.categoryId, storeId }, select: { name: true } }) : null;

  await prisma.product.update({
    where: { id },
    data: {
      name: d.name.trim(), unit: d.unit, barcode: d.barcode.trim(), additionalCode: d.additionalCode || null,
      categoryId: category ? d.categoryId : null, category: category?.name ?? null, price: d.price,
    },
  });
  return NextResponse.json({ success: true });
}
