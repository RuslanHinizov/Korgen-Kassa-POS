import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const schema = z.object({
  amount: z.number().positive(),
  method: z.enum(["CASH", "CARD", "OTHER"]).default("CASH"),
  accountId: z.string().min(1),
  note: z.string().max(500).optional(),
});

// POST /api/supplier-returns/:id/payments — record what the supplier paid back toward a posted return's balance
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: returnId } = await params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const storeId = await getStoreId();
  const supplierReturn = await prisma.supplierReturn.findFirst({
    where: { id: returnId, storeId },
    include: { payments: { select: { amount: true } } },
  });
  if (!supplierReturn) return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
  if (supplierReturn.status !== "POSTED") return NextResponse.json({ error: "Сначала проведите документ" }, { status: 409 });

  const paid = supplierReturn.payments.reduce((s, p) => s + Number(p.amount), 0);
  const remaining = Number(supplierReturn.totalAmount) - paid;
  if (parsed.data.amount > remaining + 0.01) {
    return NextResponse.json({ error: "Сумма превышает остаток к оплате" }, { status: 400 });
  }

  const account = await prisma.financeAccount.findFirst({ where: { id: parsed.data.accountId, storeId } });
  if (!account) return NextResponse.json({ error: "Счёт не найден" }, { status: 404 });

  const payment = await prisma.$transaction(async (tx) => {
    const created = await tx.supplierReturnPayment.create({
      data: { returnId, amount: parsed.data.amount, method: parsed.data.method, accountId: parsed.data.accountId, note: parsed.data.note, userId: session.user.id },
    });
    await tx.financeAccount.update({ where: { id: parsed.data.accountId }, data: { balance: { increment: parsed.data.amount } } });
    return created;
  });
  await logAudit({ userId: session.user.id, action: "SUPPLIER_RETURN_PAYMENT", entityType: "SupplierReturn", entityId: returnId, details: { amount: parsed.data.amount } });
  return NextResponse.json({ payment }, { status: 201 });
}
