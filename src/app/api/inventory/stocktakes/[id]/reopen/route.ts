import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";

// POST /api/inventory/stocktakes/:id/reopen — "Назад к подсчёту": Проведение → Подсчет.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const storeId = await getStoreId();
  const stocktake = await prisma.stocktake.findFirst({ where: { id, storeId }, select: { status: true } });
  if (!stocktake) return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
  if (stocktake.status !== "REVIEWING") return NextResponse.json({ error: "Документ не на этапе проверки" }, { status: 409 });

  const updated = await prisma.stocktake.update({ where: { id }, data: { status: "COUNTING" } });
  return NextResponse.json({ stocktake: updated });
}
