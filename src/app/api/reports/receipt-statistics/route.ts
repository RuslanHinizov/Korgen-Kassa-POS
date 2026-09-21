import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Prisma, type PaymentMethod } from "@/generated/prisma/client";
import { getStoreId } from "@/lib/store-context";
import { parseDateRange } from "@/lib/sales-statistics";
import { xlsxResponse } from "@/lib/xlsx-response";

const VALID_PAYMENT_METHODS: PaymentMethod[] = ["CASH", "CARD", "OTHER", "CREDIT"];

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const { from, to } = parseDateRange(sp);
  const mode = sp.get("mode") === "returns" ? "returns" : "sales";
  const receiptNumber = sp.get("receiptNo")?.trim().toUpperCase() || "";
  const q = sp.get("q")?.trim() || "";
  const paymentMethods = (sp.get("paymentMethods") || "")
    .split(",")
    .filter((v): v is PaymentMethod => VALID_PAYMENT_METHODS.includes(v as PaymentMethod));
  const userId = sp.get("userId") || "";
  const sortOrder = sp.get("sortOrder") === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number(sp.get("page") ?? 1));
  const pageSize = Math.min(500, Math.max(1, Number(sp.get("pageSize") ?? 25)));

  const storeId = await getStoreId();
  if (mode === "sales") {
    const where: Prisma.SaleWhereInput = {
      storeId,
      status: { in: ["COMPLETED", "REFUNDED"] },
      createdAt: { gte: from, lte: to },
      ...(userId ? { userId } : {}),
      ...(paymentMethods.length > 0 ? { paymentMethod: { in: paymentMethods } } : {}),
      ...(q ? { items: { some: { name: { contains: q, mode: "insensitive" } } } } : {}),
    };

    const all = await prisma.sale.findMany({
      where,
      select: {
        id: true, documentNo: true, createdAt: true, total: true, discountAmount: true, paymentMethod: true,
        user: { select: { name: true } },
        items: { select: { id: true, name: true, price: true, quantity: true, unit: true, total: true } },
      },
      orderBy: sp.get("sortField") === "total" ? { total: sortOrder } : { createdAt: sortOrder },
    });

    const filtered = receiptNumber ? all.filter((s) => String(s.documentNo).includes(receiptNumber)) : all;

    const totals = filtered.reduce(
      (acc, s) => ({ saleAmount: acc.saleAmount + Number(s.total), discountAmount: acc.discountAmount + Number(s.discountAmount) }),
      { saleAmount: 0, discountAmount: 0 }
    );

    if (sp.get("export") === "xlsx") {
      const header = ["№ чека", "Дата", "Кассир", "Способ оплаты", "Скидка", "Сумма"];
      return xlsxResponse({
        filename: "statistika-po-chekam",
        sheetName: "Чеки",
        rows: [header, ...filtered.map((s) => [
          s.documentNo, new Date(s.createdAt), s.user?.name ?? "—", s.paymentMethod, Number(s.discountAmount), Number(s.total),
        ])],
      });
    }

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize).map((s) => ({
      id: s.id,
      receiptNo: s.documentNo,
      createdAt: s.createdAt,
      paymentMethod: s.paymentMethod,
      total: Number(s.total),
      userName: s.user?.name ?? "—",
      items: s.items.map((it) => {
        const lineTotal = Number(it.price) * Number(it.quantity);
        const discountPct = lineTotal > 0 ? Math.max(0, ((lineTotal - Number(it.total)) / lineTotal) * 100) : 0;
        return { id: it.id, name: it.name, quantity: Number(it.quantity), unit: it.unit, price: Number(it.price), discountPct, total: Number(it.total) };
      }),
    }));

    return NextResponse.json({ items, total, totals: { saleAmount: totals.saleAmount, paymentAmount: totals.saleAmount, discountAmount: totals.discountAmount } });
  }

  // returns
  const refunds = await prisma.refund.findMany({
    where: { sale: { storeId }, createdAt: { gte: from, lte: to }, ...(userId ? { userId } : {}) },
    select: { id: true, createdAt: true, amount: true, items: true, sale: { select: { id: true, documentNo: true, paymentMethod: true } } },
    orderBy: sp.get("sortField") === "total" ? { amount: sortOrder } : { createdAt: sortOrder },
  });

  let filtered = refunds;
  if (receiptNumber) filtered = filtered.filter((r) => String(r.sale.documentNo).includes(receiptNumber));
  if (paymentMethods.length > 0) filtered = filtered.filter((r) => paymentMethods.includes(r.sale.paymentMethod));
  if (q) {
    const needle = q.toLowerCase();
    filtered = filtered.filter((r) => {
      const its = r.items as unknown as { name: string }[];
      return its.some((it) => it.name.toLowerCase().includes(needle));
    });
  }

  const totals = { returnAmount: filtered.reduce((s, r) => s + Number(r.amount), 0) };

  if (sp.get("export") === "xlsx") {
    const header = ["№ чека", "Дата", "Способ оплаты", "Сумма возврата"];
    return xlsxResponse({
      filename: "statistika-po-vozvratam",
      sheetName: "Возвраты",
      rows: [header, ...filtered.map((r) => [r.sale.documentNo, new Date(r.createdAt), r.sale.paymentMethod, Number(r.amount)])],
    });
  }

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize).map((r) => ({
    id: r.id,
    receiptNo: r.sale.documentNo,
    createdAt: r.createdAt,
    paymentMethod: r.sale.paymentMethod,
    total: Number(r.amount),
  }));

  return NextResponse.json({ items, total, totals });
}
