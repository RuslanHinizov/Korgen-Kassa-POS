import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";

// GET /api/categories/products?q=&categoryId=&uncategorized=1&onlyActive=1&take=
// Lightweight product picker for the bulk-assign tool on the Categories page.
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const p = req.nextUrl.searchParams;
  const q = (p.get("q") ?? "").trim();
  const take = Math.min(Number(p.get("take")) || 300, 1000);

  const storeId = await getStoreId();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { storeId, deletedAt: null };
  if (p.get("onlyActive") !== "0") where.active = true;
  if (p.get("uncategorized") === "1") where.categoryId = null;
  else if (p.get("categoryId")) where.categoryId = p.get("categoryId");
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { sku: { contains: q, mode: "insensitive" } },
      { barcode: { equals: q } },
    ];
  }

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      select: { id: true, name: true, barcode: true, category: true, categoryId: true, stock: true },
      orderBy: { name: "asc" },
      take,
    }),
    prisma.product.count({ where }),
  ]);

  return NextResponse.json({
    total,
    products: products.map((x) => ({ ...x, stock: Number(x.stock) })),
  });
}
