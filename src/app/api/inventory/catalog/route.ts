import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const storeId = await getStoreId();
  const products = await prisma.product.findMany({ where: { storeId, deletedAt: null }, select: { id: true, name: true, sku: true, barcode: true, scalePlu: true, price: true, cost: true, stock: true, unit: true, category: true, lowStockThreshold: true, active: true }, orderBy: { name: "asc" } });
  return NextResponse.json({ products: products.map((p) => ({ ...p, price: Number(p.price), cost: p.cost === null ? null : Number(p.cost), stock: Number(p.stock) })) });
}
