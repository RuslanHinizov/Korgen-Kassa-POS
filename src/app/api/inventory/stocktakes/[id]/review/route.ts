import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";

// POST /api/inventory/stocktakes/:id/review — "Завершить подсчёт": Подсчет → Проведение.
// Locks item edits while the counted differences are reviewed before posting.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const storeId = await getStoreId();
  const stocktake = await prisma.stocktake.findFirst({ where: { id, storeId }, include: { _count: { select: { items: true } } } });
  if (!stocktake) return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
  if (stocktake.status !== "COUNTING") return NextResponse.json({ error: "Сначала добавьте и посчитайте товары" }, { status: 409 });
  if (stocktake._count.items === 0) return NextResponse.json({ error: "Добавьте хотя бы один товар" }, { status: 400 });

  const updated = await prisma.stocktake.update({ where: { id }, data: { status: "REVIEWING" } });
  return NextResponse.json({ stocktake: updated });
}
