import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";

const line = z.object({ productId: z.string().min(1), quantity: z.number().positive(), price: z.number().nonnegative().optional() });
const schema = z.union([line, z.object({ items: z.array(line).min(1) })]);

// POST /api/supplier-returns/:id/items — add one or more lines to a still-draft
// document; a product already on the document has its quantity merged in.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER", "WAREHOUSE"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: returnId } = await params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const lines = "items" in parsed.data ? parsed.data.items : [parsed.data];

  const storeId = await getStoreId();
  const supplierReturn = await prisma.supplierReturn.findFirst({ where: { id: returnId, storeId }, select: { status: true } });
  if (!supplierReturn) return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
  if (supplierReturn.status === "POSTED") return NextResponse.json({ error: "Проведённый документ нельзя изменить" }, { status: 409 });

  const existing = await prisma.supplierReturnItem.findMany({ where: { returnId }, select: { id: true, productId: true, quantity: true, price: true } });
  const existingByProduct = new Map(existing.filter((i) => i.productId).map((i) => [i.productId as string, i]));

  const created: unknown[] = [];
  for (const l of lines) {
    const already = existingByProduct.get(l.productId);
    if (already) {
      const quantity = Number(already.quantity) + l.quantity;
      await prisma.supplierReturnItem.update({ where: { id: already.id }, data: { quantity, total: quantity * Number(already.price) } });
      continue;
    }
    const product = await prisma.product.findFirst({ where: { id: l.productId, storeId, deletedAt: null }, select: { name: true, unit: true, cost: true, price: true } });
    if (!product) continue;
    const price = l.price ?? Number(product.cost ?? product.price);
    const item = await prisma.supplierReturnItem.create({
      data: { returnId, productId: l.productId, name: product.name, unit: product.unit, quantity: l.quantity, price, total: price * l.quantity },
    });
    created.push(item);
  }
  await recomputeTotal(returnId);
  return NextResponse.json({ items: created }, { status: 201 });
}

async function recomputeTotal(returnId: string) {
  const items = await prisma.supplierReturnItem.findMany({ where: { returnId }, select: { total: true } });
  const total = items.reduce((s, i) => s + Number(i.total), 0);
  await prisma.supplierReturn.update({ where: { id: returnId }, data: { totalAmount: total } });
}
