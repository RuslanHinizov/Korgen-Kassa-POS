import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { counterpartyScope } from "@/lib/counterparty-scope";
import { getStoreId } from "@/lib/store-context";
import { getCustomerBalance } from "@/lib/customer-balance";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const schema = z.object({
  amount: z.number().positive(),
  method: z.enum(["CASH", "CARD", "OTHER"]).default("CASH"),
  accountId: z.string().min(1),
  note: z.string().max(500).optional(),
});

// GET /api/customers/:id/payments — repayment history
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: customerId } = await params;
  const storeId = await getStoreId();
  const customer = await prisma.customer.findFirst({ where: { id: customerId, ...(await counterpartyScope(storeId)) }, select: { id: true } });
  if (!customer) return NextResponse.json({ error: "Покупатель не найден" }, { status: 404 });

  const payments = await prisma.customerPayment.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { name: true } }, account: { select: { name: true } } },
  });
  return NextResponse.json({ payments });
}

// POST /api/customers/:id/payments — "Погасить долг": record a repayment against the customer's CREDIT balance
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER", "WAREHOUSE"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: customerId } = await params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const storeId = await getStoreId();
  const customer = await prisma.customer.findFirst({ where: { id: customerId, ...(await counterpartyScope(storeId)) } });
  if (!customer) return NextResponse.json({ error: "Покупатель не найден" }, { status: 404 });

  const balance = await getCustomerBalance(customerId);
  if (balance <= 0) return NextResponse.json({ error: "За покупателем нет долга" }, { status: 400 });
  if (parsed.data.amount > balance + 0.01) {
    return NextResponse.json({ error: "Сумма превышает долг покупателя" }, { status: 400 });
  }

  const account = await prisma.financeAccount.findFirst({ where: { id: parsed.data.accountId, storeId } });
  if (!account) return NextResponse.json({ error: "Счёт не найден" }, { status: 404 });

  const payment = await prisma.$transaction(async (tx) => {
    const created = await tx.customerPayment.create({
      data: { customerId, amount: parsed.data.amount, method: parsed.data.method, accountId: parsed.data.accountId, note: parsed.data.note, userId: session.user.id },
    });
    await tx.financeAccount.update({ where: { id: parsed.data.accountId }, data: { balance: { increment: parsed.data.amount } } });
    return created;
  });
  await logAudit({ userId: session.user.id, action: "CUSTOMER_PAYMENT", entityType: "Customer", entityId: customerId, details: { amount: parsed.data.amount } });
  return NextResponse.json({ payment }, { status: 201 });
}
