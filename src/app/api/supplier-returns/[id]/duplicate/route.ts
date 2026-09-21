import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";

// POST /api/supplier-returns/:id/duplicate — Действие → Копировать
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const storeId = await getStoreId();
  const source = await prisma.supplierReturn.findFirst({ where: { id, storeId }, include: { items: true } });
  if (!source) return NextResponse.json({ error: "Не найдено" }, { status: 404 });

  const copy = await prisma.supplierReturn.create({
    data: {
      storeId,
      userId: session.user.id,
      supplierId: source.supplierId,
      comment: source.comment,
      totalAmount: source.totalAmount,
      items: {
        create: source.items.map((i) => ({
          productId: i.productId, name: i.name, unit: i.unit, quantity: i.quantity, price: i.price, total: i.total,
        })),
      },
    },
  });
  return NextResponse.json({ supplierReturn: copy }, { status: 201 });
}
