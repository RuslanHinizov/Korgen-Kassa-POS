import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { serialize } from "@/lib/serialize";
import { hasKioskAccess } from "@/lib/kiosk-device";

/** POS-only history feed. Keeps the cashier in the register rather than routing to administration. */
export async function GET(req: NextRequest) {
  if (!(await hasKioskAccess())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim() ?? "";
  const from = sp.get("from");
  const to = sp.get("to");
  const status = sp.get("status");
  const page = Math.max(1, Number(sp.get("page") ?? 1));
  const rawLimit = Number(sp.get("pageSize") ?? sp.get("limit") ?? 50);
  const take = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.floor(rawLimit), 1), 100) : 50;
  const storeId = await getStoreId();
  const qAsDocumentNo = /^\d+$/.test(q) ? Number(q) : undefined;
  const where = {
    storeId,
    ...(from || to ? { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
    ...(status ? { status: status as "COMPLETED" | "VOIDED" | "REFUNDED" } : {}),
    ...(q ? { OR: [
      { id: { contains: q, mode: "insensitive" as const } },
      ...(qAsDocumentNo !== undefined ? [{ documentNo: qAsDocumentNo }] : []),
    ] } : {}),
  };
  const [total, sales] = await Promise.all([
    prisma.sale.count({ where }),
    prisma.sale.findMany({
    where,
    include: {
      items: {
        select: {
          id: true,
          name: true,
          quantity: true,
          unit: true,
          price: true,
          total: true,
          notes: true,
          productId: true,
          discountAmount: true,
        },
      },
      user: { select: { name: true } },
      refunds: { select: { id: true, amount: true, reason: true, items: true, createdAt: true }, orderBy: { createdAt: "desc" } },
    },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * take,
    take,
  }),
  ]);

  const result = sales.map((sale) => {
    const refunded = new Map<string, number>();
    for (const refund of sale.refunds) {
      if (!Array.isArray(refund.items)) continue;
      for (const item of refund.items) {
        if (item && typeof item === "object" && "saleItemId" in item && typeof item.saleItemId === "string") {
          const quantity = Number("quantity" in item ? item.quantity : 0);
          refunded.set(item.saleItemId, (refunded.get(item.saleItemId) ?? 0) + (Number.isFinite(quantity) ? quantity : 0));
        }
      }
    }
    return {
      ...sale,
      items: sale.items.map((item) => ({ ...item, returnableQuantity: Math.max(0, Number(item.quantity) - (refunded.get(item.id) ?? 0)) })),
      refunds: sale.refunds,
    };
  });
  return NextResponse.json({ sales: serialize(result), total, page, pageSize: take });
}
