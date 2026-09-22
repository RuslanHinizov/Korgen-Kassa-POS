import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";

const PRODUCT_SELECT = {
  id: true, name: true, barcode: true, unit: true, price: true, cost: true, stock: true,
} as const;

// GET /api/products/admin-search?q=&supplierId=&page=&pageSize= — Товары поставщика / Номенклатура
// picker for purchasing/warehouse documents. Складской работник gets this too (they use it
// to add lines to Приёмка/Оприходование/Перемещение) but never sees cost — see canSeeCost below.
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER", "WAREHOUSE"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const canSeeCost = ["ADMIN", "MANAGER"].includes(session.user.role ?? "");

  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim() ?? "";
  const supplierId = sp.get("supplierId") ?? "";
  const page = Math.max(1, Number(sp.get("page") ?? 1));
  const pageSize = Math.min(200, Math.max(1, Number(sp.get("pageSize") ?? 50)));

  const type = sp.get("type");
  const storeId = await getStoreId();
  const where = {
    storeId,
    active: true,
    deletedAt: null,
    ...(type === "REGULAR" ? { productType: "REGULAR" as const } : {}),
    ...(supplierId ? { supplierId } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { barcode: { contains: q } }] } : {}),
  };

  const [total, products] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({ where, select: PRODUCT_SELECT, orderBy: { name: "asc" }, skip: (page - 1) * pageSize, take: pageSize }),
  ]);

  return NextResponse.json({
    products: products.map((p) => ({ ...p, price: Number(p.price), cost: canSeeCost && p.cost != null ? Number(p.cost) : null, stock: Number(p.stock) })),
    total,
  });
}
