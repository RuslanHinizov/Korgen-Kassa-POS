import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { parseDateRange } from "@/lib/sales-statistics";
import { xlsxResponse } from "@/lib/xlsx-response";

interface Row {
  productId: string | null;
  productName: string;
  barcode: string | null;
  quantity: number;
  unit: string;
  originalPrice: number;
  discount: number;
  discountedPrice: number;
  soldAt: Date;
}

// GET /api/reports/discount-items — every sold line from a discounted sale,
// with the discount allocated proportionally across that sale's lines
// (Sale.discountAmount is cart-level only — no per-line discount is stored).
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const { from, to } = parseDateRange(sp);
  const q = sp.get("q")?.trim().toLowerCase() || "";
  const page = Math.max(1, Number(sp.get("page") ?? 1));
  const pageSize = Math.min(500, Math.max(1, Number(sp.get("pageSize") ?? 50)));

  const storeId = await getStoreId();
  const sales = await prisma.sale.findMany({
    where: {
      storeId,
      status: { in: ["COMPLETED", "REFUNDED"] },
      createdAt: { gte: from, lte: to },
      discountAmount: { gt: 0 },
    },
    orderBy: { createdAt: "desc" },
    select: {
      createdAt: true, subtotal: true, discountAmount: true,
      items: { select: { productId: true, name: true, price: true, quantity: true, unit: true, product: { select: { barcode: true } } } },
    },
  });

  const rows: Row[] = [];
  for (const s of sales) {
    const subtotal = Number(s.subtotal);
    const discountAmount = Number(s.discountAmount);
    if (subtotal <= 0) continue;
    for (const it of s.items) {
      const qty = Number(it.quantity);
      const price = Number(it.price);
      const lineSubtotal = price * qty;
      const lineDiscount = (lineSubtotal / subtotal) * discountAmount;
      const unitDiscount = qty > 0 ? lineDiscount / qty : 0;
      rows.push({
        productId: it.productId,
        productName: it.name,
        barcode: it.product?.barcode ?? null,
        quantity: qty,
        unit: it.unit,
        originalPrice: price,
        discount: unitDiscount,
        discountedPrice: price - unitDiscount,
        soldAt: s.createdAt,
      });
    }
  }

  const filtered = q
    ? rows.filter((r) => r.productName.toLowerCase().includes(q) || (r.barcode ?? "").includes(q))
    : rows;

  if (sp.get("export") === "xlsx") {
    const header = ["№", "Название товара", "Штрихкод", "Количество", "Ед. изм", "Начальная цена", "Скидка", "Цена со скидкой", "Время продажи"];
    return xlsxResponse({
      filename: "otchet-po-skidkam",
      sheetName: "Скидки",
      rows: [header, ...filtered.map((r, i) => [
        i + 1, r.productName, r.barcode ?? "", r.quantity, r.unit, r.originalPrice,
        r.discount, r.discountedPrice, new Date(r.soldAt),
      ])],
    });
  }

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize).map((r, i) => ({ no: start + i + 1, ...r }));

  return NextResponse.json({ items, total });
}
