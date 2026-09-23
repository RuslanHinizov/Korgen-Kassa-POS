import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { xlsxResponse } from "@/lib/xlsx-response";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Черновик", COUNTING: "Подсчёт", REVIEWING: "Проведение", POSTED: "Проведён", CANCELLED: "Отменён",
};

// GET /api/inventory/stocktakes/:id/export — item-level xlsx with a reconciliation summary.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const storeId = await getStoreId();
  const canSeeCost = session.user.role !== "WAREHOUSE";

  const stocktake = await prisma.stocktake.findFirst({
    where: { id, storeId },
    include: { user: { select: { name: true } }, items: { include: { product: { select: { name: true, barcode: true, unit: true, cost: true, price: true } } } } },
  });
  if (!stocktake) return NextResponse.json({ error: "Не найдено" }, { status: 404 });

  const header = ["Товар", "Штрихкод", "Время сканирования", "Сканировано", "Остаток на время сканирования", "Разница", ...(canSeeCost ? ["Закуп. цена"] : []), "Прод. цена"];
  const rows = stocktake.items.map((i) => {
    const counted = i.countedQty != null ? Number(i.countedQty) : 0;
    const diff = i.difference != null ? Number(i.difference) : -Number(i.expectedQty);
    return [
      i.product.name, i.product.barcode ?? "", i.scannedAt ?? "", counted, Number(i.expectedQty), diff,
      ...(canSeeCost ? [i.product.cost != null ? Number(i.product.cost) : ""] : []),
      Number(i.product.price),
    ];
  });

  const surplus = stocktake.items.filter((i) => i.difference != null && Number(i.difference) > 0);
  const shortage = stocktake.items.filter((i) => i.difference != null && Number(i.difference) < 0);
  const surplusValue = surplus.reduce((s, i) => s + Number(i.difference) * Number(i.product.price), 0);
  const shortageValue = shortage.reduce((s, i) => s + Math.abs(Number(i.difference)) * Number(i.product.price), 0);

  return xlsxResponse({
    filename: `inventarizaciya-${stocktake.documentNo}`,
    sheetName: `Инв. №${stocktake.documentNo}`,
    rows: [
      [`Инвентаризация №${stocktake.documentNo}`],
      ["Статус", STATUS_LABEL[stocktake.status] ?? stocktake.status],
      ["Дата подсчёта", stocktake.countedAt],
      ["Проведена", stocktake.postedAt ?? ""],
      ["Пользователь", stocktake.user.name],
      ["Комментарий", stocktake.note ?? ""],
      [],
      header,
      ...rows,
      [],
      ["Итого позиций", stocktake.items.length],
      ["Излишек (кол-во / сумма ₸)", surplus.length, surplusValue],
      ["Недостача (кол-во / сумма ₸)", shortage.length, shortageValue],
    ],
  });
}
