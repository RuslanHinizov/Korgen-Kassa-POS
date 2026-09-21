import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { counterpartyScope } from "@/lib/counterparty-scope";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  notes: z.string().optional(),
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const storeId = await getStoreId();
  const existing = await prisma.supplier.findFirst({ where: { id, ...(await counterpartyScope(storeId)) } });
  if (!existing) return NextResponse.json({ error: "Поставщик не найден" }, { status: 404 });

  const supplier = await prisma.supplier.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ supplier });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const storeId = await getStoreId();
  const existing = await prisma.supplier.findFirst({ where: { id, ...(await counterpartyScope(storeId)) } });
  if (!existing) return NextResponse.json({ error: "Поставщик не найден" }, { status: 404 });
  const [products, receipts, returns] = await Promise.all([
    prisma.product.count({ where: { supplierId: id, deletedAt: null } }),
    prisma.purchaseReceipt.count({ where: { supplierId: id } }),
    prisma.supplierReturn.count({ where: { supplierId: id } }),
  ]);
  if (products + receipts + returns > 0) {
    return NextResponse.json({ error: `Нельзя удалить: у поставщика есть товары (${products}), приёмки (${receipts}) или возвраты (${returns})` }, { status: 409 });
  }
  await prisma.supplier.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
