import { backdatingError } from "@/lib/backdating";
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { counterpartyScope } from "@/lib/counterparty-scope";
import { getStoreId } from "@/lib/store-context";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const schema = z.object({
  supplierId: z.string().min(1),
  amount: z.number().positive(),
  comment: z.string().max(1000).optional(),
  isConsignment: z.boolean().optional(),
  createdAt: z.coerce.date().optional(),
});

// POST /api/purchase-receipts/quick — Быстрая приёмка: a lump-sum debt to a
// supplier with no line items (no specific products, so no stock movement),
// posted immediately — matches UMAG's "Оформление быстрой приемки" form.
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER", "WAREHOUSE"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const storeId = await getStoreId();
  const supplier = await prisma.supplier.findFirst({ where: { id: parsed.data.supplierId, ...(await counterpartyScope(storeId)) } });
  if (!supplier) return NextResponse.json({ error: "Поставщик не найден" }, { status: 404 });

  const bd = await backdatingError(storeId, parsed.data.createdAt);
  if (bd) return NextResponse.json({ error: bd }, { status: 400 });

  const receipt = await prisma.purchaseReceipt.create({
    data: {
      storeId,
      userId: session.user.id,
      supplierId: parsed.data.supplierId,
      comment: parsed.data.comment,
      isConsignment: parsed.data.isConsignment ?? false,
      totalAmount: parsed.data.amount,
      status: "POSTED",
      createdAt: parsed.data.createdAt,
      postedAt: parsed.data.createdAt ?? new Date(),
    },
  });

  await logAudit({ userId: session.user.id, action: "PURCHASE_RECEIPT_POST", entityType: "PurchaseReceipt", entityId: receipt.id, details: { quick: true, amount: parsed.data.amount } });
  return NextResponse.json({ receipt }, { status: 201 });
}
