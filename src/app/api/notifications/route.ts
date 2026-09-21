import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";

export type AppNotification = {
  id: string;
  level: "warning" | "error";
  title: string;
  description: string;
  href: string;
};

/** Live, store-scoped operational alerts shown from the global navigation. */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const storeId = await getStoreId();
  const [products, activeCashboxes] = await Promise.all([
    prisma.product.findMany({
      where: { storeId, active: true, deletedAt: null },
      select: { id: true, name: true, stock: true, lowStockThreshold: true },
      orderBy: { stock: "asc" },
      take: 100,
    }),
    prisma.cashbox.count({ where: { storeId, active: true } }),
  ]);

  const lowStock = products.filter((product) =>
    product.stock.lessThanOrEqualTo(product.lowStockThreshold)
  );
  const notifications: AppNotification[] = [];

  if (lowStock.length > 0) {
    notifications.push({
      id: "low-stock",
      level: "warning",
      title: "Низкий остаток товаров",
      description: `Товаров на минимальном остатке: ${lowStock.length}.`,
      href: "/reports?tab=lowStock",
    });
  }

  if (activeCashboxes === 0) {
    notifications.push({
      id: "cashbox-missing",
      level: "warning",
      title: "Нет активной кассы",
      description: "Для приёма оплаты настройте и активируйте кассу.",
      href: "/management/cashboxes",
    });
  }

  return NextResponse.json({ notifications });
}
