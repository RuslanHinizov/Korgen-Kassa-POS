import { formatReferenceValues } from "@/lib/reference-values";
import { xlsxResponse } from "@/lib/xlsx-response";
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
      ...(to ? { lte: /^\d{4}-\d{2}-\d{2}$/.test(to) ? new Date(`${to}T23:59:59.999`) : new Date(to) } : {}),
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

  const rows: (string | number | Date)[][] = [
    ["Номер продажи", "Дата", "Статус", "Способ оплаты", "Промежуточный итог", "Скидка", "Налог", "Итого", "Товары", "Справочники"],
    ...sales.map((sale) => [
      sale.documentNo,
      sale.createdAt,
      STATUS_LABELS[sale.status] ?? sale.status,
      PAYMENT_LABELS[sale.paymentMethod] ?? sale.paymentMethod,
      Number(sale.subtotal),
      Number(sale.discountAmount),
      Number(sale.taxAmount),
      Number(sale.total),
      sale.items.map((i: typeof sale.items[number]) => `${i.quantity}x ${i.product?.name ?? i.name}`).join("; "),
      formatReferenceValues(sale.referenceValues),
    ]),
  ];
  return xlsxResponse({ filename: `prodazhi-${new Date().toISOString().slice(0, 10)}`, sheetName: "Продажи", rows });
}
