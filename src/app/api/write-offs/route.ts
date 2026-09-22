import { backdatingError } from "@/lib/backdating";
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { xlsxResponse } from "@/lib/xlsx-response";
import { getStoreId } from "@/lib/store-context";

// GET /api/write-offs?from=&to=&status=DRAFT,POSTED — list, newest first
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const statusParam = searchParams.get("status"); // "DRAFT,POSTED"
  const statuses = statusParam ? statusParam.split(",").filter((s) => s === "DRAFT" || s === "POSTED") : undefined;
  const storeId = await getStoreId();

  const writeOffs = await prisma.writeOff.findMany({
    where: {
      storeId,
      ...(from || to ? { writeOffDate: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
      ...(statuses && statuses.length > 0 ? { status: { in: statuses as ("DRAFT" | "POSTED")[] } } : {}),
    },
    orderBy: { writeOffDate: "desc" },
    include: { user: { select: { name: true } }, _count: { select: { items: true } } },
    ...(req.nextUrl.searchParams.get("export") === "xlsx" ? {} : { take: 200 }),
  });

  if (req.nextUrl.searchParams.get("export") === "xlsx") {
    return xlsxResponse({
      filename: "spisanie",
      sheetName: "Списание",
      rows: [
        ["Номер", "Дата", "Статус", "Пользователь", "Позиций", "Сумма", "Комментарий"],
        ...writeOffs.map((w) => [w.documentNo, w.writeOffDate, w.status === "POSTED" ? "Проведён" : "Черновик", w.user.name, w._count.items, Number(w.totalCost), w.note ?? ""]),
      ],
    });
  }

  return NextResponse.json({
    writeOffs: writeOffs.map((w) => ({
      id: w.id, documentNo: w.documentNo, status: w.status, writeOffDate: w.writeOffDate,
      note: w.note, totalCost: Number(w.totalCost), userName: w.user.name, itemCount: w._count.items,
    })),
  });
}

// POST /api/write-offs — create an empty draft
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER", "WAREHOUSE"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const writeOffDate = body?.writeOffDate ? new Date(body.writeOffDate) : new Date();
  const storeId = await getStoreId();
  const bd = await backdatingError(storeId, writeOffDate);
  if (bd) return NextResponse.json({ error: bd }, { status: 400 });

  const writeOff = await prisma.writeOff.create({
    data: { storeId, userId: session.user.id, writeOffDate },
  });
  return NextResponse.json({ writeOff }, { status: 201 });
}
