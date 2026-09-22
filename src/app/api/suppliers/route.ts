import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { counterpartyScope } from "@/lib/counterparty-scope";
import { getStoreId } from "@/lib/store-context";
import { xlsxResponse } from "@/lib/xlsx-response";
import { z } from "zod";

const supplierSchema = z.object({
  name: z.string().min(1),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  notes: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q") ?? "";
  const storeId = await getStoreId();
  const suppliers = await prisma.supplier.findMany({
    where: { ...(await counterpartyScope(storeId)), ...(q ? { name: { contains: q, mode: "insensitive" } } : {}) },
    orderBy: { name: "asc" },
    include: { _count: { select: { products: { where: { deletedAt: null } } } } },
  });

  if (req.nextUrl.searchParams.get("export") === "xlsx") {
    return xlsxResponse({
      filename: "postavshchiki",
      sheetName: "Поставщики",
      rows: [
        ["Название", "Контактное лицо", "Телефон", "Email", "Товаров", "Заметки"],
        ...suppliers.map((s) => [s.name, s.contactName ?? "", s.phone ?? "", s.email ?? "", s._count.products, s.notes ?? ""]),
      ],
    });
  }

  return NextResponse.json({ suppliers });
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER", "WAREHOUSE"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = supplierSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const storeId = await getStoreId();
  const supplier = await prisma.supplier.create({ data: { ...parsed.data, storeId } });
  return NextResponse.json({ supplier }, { status: 201 });
}
