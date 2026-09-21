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
  note: z.string().max(500).optional(),
});

// POST /api/customer-returns/:id/payments — record a payout toward a posted return's balance
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: returnId } = await params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const storeId = await getStoreId();
  const customerReturn = await prisma.customerReturn.findFirst({
    where: { id: returnId, storeId },
    include: { payments: { select: { amount: true } } },
  });
  if (!customerReturn) return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
  if (customerReturn.status !== "POSTED") return NextResponse.json({ error: "Сначала проведите документ" }, { status: 409 });

  const paid = customerReturn.payments.reduce((s, p) => s + Number(p.amount), 0);
  const remaining = Number(customerReturn.totalAmount) - paid;
  if (parsed.data.amount > remaining + 0.01) {
    return NextResponse.json({ error: "Сумма превышает остаток к оплате" }, { status: 400 });
  }

  const payment = await prisma.customerReturnPayment.create({
    data: { returnId, amount: parsed.data.amount, method: parsed.data.method, note: parsed.data.note, userId: session.user.id },
  });
  await logAudit({ userId: session.user.id, action: "CUSTOMER_RETURN_PAYMENT", entityType: "CustomerReturn", entityId: returnId, details: { amount: parsed.data.amount } });
  return NextResponse.json({ payment }, { status: 201 });
}
