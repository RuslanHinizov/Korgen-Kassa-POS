import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";

const schema = z.object({
  productId: z.string().min(1),
  quantity: z.number().positive(),
  price: z.number().nonnegative().optional(),
});

// POST /api/customer-returns/:id/items — add a line to a still-draft document
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER", "WAREHOUSE"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: returnId } = await params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const storeId = await getStoreId();
  const customerReturn = await prisma.customerReturn.findFirst({ where: { id: returnId, storeId }, select: { status: true } });
  if (!customerReturn) return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
  if (customerReturn.status === "POSTED") return NextResponse.json({ error: "Проведённый документ нельзя изменить" }, { status: 409 });

  const product = await prisma.product.findFirst({ where: { id: parsed.data.productId, storeId, deletedAt: null }, select: { name: true, unit: true, price: true } });
  if (!product) return NextResponse.json({ error: "Товар не найден" }, { status: 404 });

  const price = parsed.data.price ?? Number(product.price);
  const item = await prisma.customerReturnItem.create({
    data: {
      returnId,
      productId: parsed.data.productId,
      name: product.name,
      unit: product.unit,
      quantity: parsed.data.quantity,
      price,
      total: price * parsed.data.quantity,
    },
  });
  await recomputeTotal(returnId);
  return NextResponse.json({ item }, { status: 201 });
}

async function recomputeTotal(returnId: string) {
  const items = await prisma.customerReturnItem.findMany({ where: { returnId }, select: { total: true } });
  const total = items.reduce((s, i) => s + Number(i.total), 0);
  await prisma.customerReturn.update({ where: { id: returnId }, data: { totalAmount: total } });
}
