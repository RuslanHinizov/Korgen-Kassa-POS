import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const days = Math.min(Math.max(Number(req.nextUrl.searchParams.get("days")) || 30, 1), 365);
  const until = new Date(); until.setDate(until.getDate() + days);
  const storeId = await getStoreId();
  const lots = await prisma.inventoryLot.findMany({ where: { product: { storeId }, availableQty: { gt: 0 }, expiresAt: { not: null, lte: until } }, include: { product: { select: { name: true, unit: true, barcode: true } }, supplier: { select: { name: true } } }, orderBy: { expiresAt: "asc" } });
  return NextResponse.json({ lots: lots.map((l) => ({ ...l, receivedQty: Number(l.receivedQty), availableQty: Number(l.availableQty), unitCost: l.unitCost === null ? null : Number(l.unitCost) })) });
}
