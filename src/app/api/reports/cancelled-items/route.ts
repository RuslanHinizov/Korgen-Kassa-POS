import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { getStoreId } from "@/lib/store-context";
import { parseDateRange } from "@/lib/sales-statistics";
import { xlsxResponse } from "@/lib/xlsx-response";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const { from, to } = parseDateRange(sp);
  const q = sp.get("q")?.trim() || "";
  const cashboxId = sp.get("cashboxId") || "";
  const page = Math.max(1, Number(sp.get("page") ?? 1));
  const pageSize = Math.min(500, Math.max(1, Number(sp.get("pageSize") ?? 25)));

  const storeId = await getStoreId();
  const where: Prisma.CancelledItemWhereInput = {
    storeId,
    createdAt: { gte: from, lte: to },
    ...(q ? { productName: { contains: q, mode: "insensitive" } } : {}),
    ...(cashboxId ? { cashboxId } : {}),
  };

  const selectFields = {
    id: true, productId: true, productName: true, beforeQty: true, afterQty: true, reason: true, createdAt: true,
    user: { select: { name: true } },
    cashbox: { select: { name: true } },
  } as const;

  function toItem(r: { id: string; productId: string | null; productName: string; beforeQty: unknown; afterQty: unknown; reason: string | null; createdAt: Date; user: { name: string }; cashbox: { name: string } | null }) {
    return {
      id: r.id,
      productId: r.productId,
      productName: r.productName,
      beforeQty: Number(r.beforeQty),
      afterQty: r.afterQty != null ? Number(r.afterQty) : null,
      reason: r.reason,
      createdAt: r.createdAt,
      userName: r.user.name,
      cashboxName: r.cashbox?.name ?? null,
    };
  }

  if (sp.get("export") === "xlsx") {
    const all = await prisma.cancelledItem.findMany({ where, orderBy: { createdAt: "desc" }, select: selectFields });
    const items = all.map(toItem);
    const header = ["Касса", "Кассир", "Название товара", "Дата и время", "Было", "Стало"];
    return xlsxResponse({
      filename: "otmenennye-tovary",
      sheetName: "Отменённые товары",
      rows: [header, ...items.map((r) => [
        r.cashboxName ?? "—", r.userName, r.productName, new Date(r.createdAt), r.beforeQty, r.afterQty ?? 0,
      ])],
    });
  }

  const [total, rows] = await Promise.all([
    prisma.cancelledItem.count({ where }),
    prisma.cancelledItem.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: selectFields,
    }),
  ]);

  const items = rows.map(toItem);

  return NextResponse.json({ items, total });
}
