import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const p = req.nextUrl.searchParams;
  const from = p.get("from"), to = p.get("to"), productId = p.get("productId"), type = p.get("type");
  const storeId = await getStoreId();
  const movements = await prisma.inventoryMovement.findMany({ where: { product: { storeId }, ...(productId ? { productId } : {}), ...(type ? { type: type as never } : {}), ...(from || to ? { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(`${to}T23:59:59.999`) } : {}) } } : {}) }, include: { product: { select: { name: true, sku: true, barcode: true, unit: true, category: true } }, user: { select: { name: true } }, supplier: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: Math.min(Number(p.get("take")) || 500, 1000) });
  return NextResponse.json({ movements });
}
