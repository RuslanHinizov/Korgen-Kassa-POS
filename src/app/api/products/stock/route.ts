import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { xlsxResponse } from "@/lib/xlsx-response";
import { Prisma } from "@/generated/prisma/client";

/**
 * GET /api/products/stock?q=&page=&pageSize= — UMAG's Товары → Склад: a read-only, paginated
 * stock list with sale value only (no cost/markup, unlike /api/products). Built for Складской
 * работник, who UMAG never shows purchase price to; kept open to ADMIN/MANAGER too.
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER", "WAREHOUSE"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const storeId = await getStoreId();
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const where = {
    storeId, active: true, deletedAt: null,
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { barcode: { contains: q } }, { additionalCode: { contains: q, mode: "insensitive" as const } }] } : {}),
  };

  if (req.nextUrl.searchParams.get("export") === "xlsx") {
    const all = await prisma.product.findMany({ where, select: { name: true, barcode: true, additionalCode: true, stock: true, price: true }, orderBy: { name: "asc" } });
    return xlsxResponse({
      filename: "sklad",
      sheetName: "Склад",
      rows: [
        ["Название товара", "Штрихкод", "Доп. код", "Кол-во", "Продажная цена", "Сумма по продажной"],
        ...all.map((p) => [p.name, p.barcode ?? "", p.additionalCode ?? "", Number(p.stock), Number(p.price), Number(p.stock) * Number(p.price)]),
      ],
    });
  }

  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") ?? 1));
  const pageSize = Math.min(500, Math.max(1, Number(req.nextUrl.searchParams.get("pageSize") ?? 50)));

  const [products, count, saleValueTotal] = await Promise.all([
    prisma.product.findMany({
      where, select: { id: true, name: true, barcode: true, additionalCode: true, stock: true, price: true, unit: true },
      orderBy: { name: "asc" }, skip: (page - 1) * pageSize, take: pageSize,
    }),
    prisma.product.count({ where }),
    q
      ? prisma.product.aggregate({ where, _sum: { stock: true } }).then(async () => {
          const rows = await prisma.product.findMany({ where, select: { stock: true, price: true } });
          return rows.reduce((s, r) => s + Number(r.stock) * Number(r.price), 0);
        })
      : prisma.$queryRaw<{ total: string | null }[]>(Prisma.sql`SELECT SUM(stock * price) AS total FROM "Product" WHERE active = true AND "deletedAt" IS NULL AND "storeId" = ${storeId}`)
          .then((r) => parseFloat(r[0]?.total ?? "0") || 0),
  ]);

  const rows = products.map((p) => ({
    id: p.id, name: p.name, barcode: p.barcode, additionalCode: p.additionalCode,
    stock: Number(p.stock), price: Number(p.price), unit: p.unit, saleValue: Number(p.stock) * Number(p.price),
  }));

  return NextResponse.json({ rows, count, page, pageSize, total: saleValueTotal });
}
