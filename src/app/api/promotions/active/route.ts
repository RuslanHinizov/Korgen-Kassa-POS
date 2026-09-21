import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";

// GET /api/promotions/active — active promotions serialised for the POS engine.
// (Time-window filtering happens client- and server-side via isPromotionLive.)
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const storeId = await getStoreId();

  const rows = await prisma.promotion.findMany({
    where: { storeId, active: true },
    orderBy: { priority: "desc" },
    include: { bundleItems: { select: { productId: true, quantity: true } } },
  });

  const promotions = rows.map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    active: p.active,
    priority: p.priority,
    scope: p.scope,
    categoryId: p.categoryId,
    productId: p.productId,
    percent: p.percent === null ? null : Number(p.percent),
    amount: p.amount === null ? null : Number(p.amount),
    buyQty: p.buyQty,
    getQty: p.getQty,
    getPercent: p.getPercent === null ? null : Number(p.getPercent),
    minSubtotal: p.minSubtotal === null ? null : Number(p.minSubtotal),
    startsAt: p.startsAt,
    endsAt: p.endsAt,
    daysOfWeek: p.daysOfWeek,
    startTime: p.startTime,
    endTime: p.endTime,
    bundleItems: p.bundleItems,
  }));

  return NextResponse.json({ promotions });
}
