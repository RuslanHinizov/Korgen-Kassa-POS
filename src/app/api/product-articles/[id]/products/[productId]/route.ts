import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";

const patchSchema = z.object({
  costPrice: z.number().min(0).optional(),
  salePrice: z.number().min(0).optional(),
});

// PATCH /api/product-articles/:id/products/:productId — edit one variant's price
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; productId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id, productId } = await params;
  const storeId = await getStoreId();
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const product = await prisma.product.findFirst({ where: { id: productId, articleId: id, storeId } });
  if (!product) return NextResponse.json({ error: "Не найдено" }, { status: 404 });

  const updated = await prisma.product.update({
    where: { id: productId },
    data: {
      ...(parsed.data.costPrice !== undefined ? { cost: parsed.data.costPrice } : {}),
      ...(parsed.data.salePrice !== undefined ? { price: parsed.data.salePrice } : {}),
    },
  });
  return NextResponse.json({ product: { id: updated.id, costPrice: Number(updated.cost ?? 0), salePrice: Number(updated.price) } });
}

// DELETE /api/product-articles/:id/products/:productId — remove one variant.
// Refuses if the product already has real activity (sales, receipts, etc.)
// rather than silently orphaning that history.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; productId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id, productId } = await params;
  const storeId = await getStoreId();
  const product = await prisma.product.findFirst({ where: { id: productId, articleId: id, storeId } });
  if (!product) return NextResponse.json({ error: "Не найдено" }, { status: 404 });

  try {
    await prisma.product.delete({ where: { id: productId } });
  } catch (error: unknown) {
    if ((error as { code?: string })?.code === "P2003") {
      return NextResponse.json({ error: "Нельзя удалить: товар уже участвует в продажах или движениях склада" }, { status: 409 });
    }
    throw error;
  }
  return NextResponse.json({ success: true });
}
