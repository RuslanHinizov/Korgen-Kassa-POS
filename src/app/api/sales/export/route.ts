import { formatReferenceValues } from "@/lib/reference-values";
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const storeId = await getStoreId();
  const where: Record<string, unknown> = { storeId };
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    };
  }

  const sales = await prisma.sale.findMany({
    where,
    include: {
      items: { include: { product: { select: { name: true, sku: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  const STATUS_LABELS: Record<string, string> = { COMPLETED: "Завершена", VOIDED: "Отменена", REFUNDED: "Возврат" };
  const PAYMENT_LABELS: Record<string, string> = { CASH: "Наличные", CARD: "Карта", OTHER: "Другое", CREDIT: "В долг" };

  // Build CSV
  const rows: string[] = [
    [
      "Номер продажи",
      "Дата",
      "Статус",
      "Способ оплаты",
      "Промежуточный итог",
      "Скидка",
      "Налог",
      "Итого",
      "Товары",
      "Справочники",
    ].join(","),
  ];

  for (const sale of sales) {
    const itemsSummary = sale.items
      .map((i: typeof sale.items[number]) => `${i.quantity}x ${i.product?.name ?? i.name}`)
      .join("; ");

    rows.push(
      [
        sale.documentNo,
        sale.createdAt.toLocaleString("ru-RU"),
        STATUS_LABELS[sale.status] ?? sale.status,
        PAYMENT_LABELS[sale.paymentMethod] ?? sale.paymentMethod,
        sale.subtotal.toFixed(2),
        sale.discountAmount.toFixed(2),
        sale.taxAmount.toFixed(2),
        sale.total.toFixed(2),
        `"${itemsSummary.replace(/"/g, '""')}"`,
        `"${formatReferenceValues(sale.referenceValues).replace(/"/g, '""')}"`,
      ].join(",")
    );
  }

  const csv = rows.join("\n");

  return new NextResponse("﻿" + csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sales-export-${Date.now()}.csv"`,
    },
  });
}
