import { NextRequest, NextResponse } from "next/server";
import { headers, cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { counterpartyScope } from "@/lib/counterparty-scope";
import { getStoreId } from "@/lib/store-context";
import { getCustomerBalance } from "@/lib/customer-balance";
import { logAudit } from "@/lib/audit";
import { verifyManagerToken, MANAGER_COOKIE } from "@/lib/manager-token";
import { CASHBOX_DEVICE_COOKIE, getPairedCashboxId } from "@/lib/cashbox-device";
import { z } from "zod";

const schema = z.object({
  amount: z.number().positive(),
  method: z.enum(["CASH", "CARD", "OTHER"]).default("CASH"),
  /** Office use picks an account explicitly; a kiosk repaying from Доп. функции → ДОЛГ has none of
   * that UI, so it's optional there and resolved from the terminal's paired cashbox instead. */
  accountId: z.string().min(1).optional(),
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

// POST /api/customers/:id/payments — "Погасить долг": record a repayment against the customer's CREDIT balance.
// A cashier can also do this from the kiosk's Доп. функции → ДОЛГ (UMAG lets any till do it) — gated by the
// same manager-PIN cookie the refund/cashbox-unpair flows already use, not a full ADMIN/MANAGER session.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const privileged = ["ADMIN", "MANAGER", "WAREHOUSE"].includes(session.user.role ?? "");
  const mgrCookie = (await cookies()).get(MANAGER_COOKIE)?.value;
  if (!privileged && !verifyManagerToken(mgrCookie, session.user.id)) {
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

  const pairedCashboxId = parsed.data.accountId ? null : getPairedCashboxId((await cookies()).get(CASHBOX_DEVICE_COOKIE)?.value);
  const accountId =
    parsed.data.accountId ??
    (pairedCashboxId ? (await prisma.cashbox.findFirst({ where: { id: pairedCashboxId, storeId }, select: { accountId: true } }))?.accountId : null);
  if (!accountId) return NextResponse.json({ error: "Не удалось определить счёт для погашения" }, { status: 400 });

  const account = await prisma.financeAccount.findFirst({ where: { id: accountId, storeId } });
  if (!account) return NextResponse.json({ error: "Счёт не найден" }, { status: 404 });

  const payment = await prisma.$transaction(async (tx) => {
    const created = await tx.customerPayment.create({
      data: { customerId, amount: parsed.data.amount, method: parsed.data.method, accountId, note: parsed.data.note, userId: session.user.id },
    });
    await tx.financeAccount.update({ where: { id: accountId }, data: { balance: { increment: parsed.data.amount } } });
    return created;
  });
  await logAudit({ userId: session.user.id, action: "CUSTOMER_PAYMENT", entityType: "Customer", entityId: customerId, details: { amount: parsed.data.amount } });
  return NextResponse.json({ payment }, { status: 201 });
}
