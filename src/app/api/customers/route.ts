import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { counterpartyScope } from "@/lib/counterparty-scope";
import { getStoreId } from "@/lib/store-context";
import { getCustomerBalances } from "@/lib/customer-balance";
import { xlsxResponse } from "@/lib/xlsx-response";
import { z } from "zod";

// ---- GET /api/customers?q=search&page=1&limit=20 ----
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const q = searchParams.get("q") ?? "";
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "20");
  const skip = (page - 1) * limit;
  const exporting = searchParams.get("export") === "xlsx";
  const storeId = await getStoreId();

  const where = {
    ...(await counterpartyScope(storeId)),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } as const },
            { phone: { contains: q, mode: "insensitive" } as const },
            { email: { contains: q, mode: "insensitive" } as const },
          ],
        }
      : {}),
  };

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { name: "asc" },
      ...(exporting ? {} : { skip, take: limit }),
      select: { id: true, name: true, phone: true, email: true, loyaltyPoints: true, notes: true, createdAt: true },
    }),
    prisma.customer.count({ where }),
  ]);

  // Enrich with sales stats
  const customerIds = customers.map((c) => c.id);
  const salesStats = await prisma.sale.groupBy({
    by: ["customerId"],
    where: { storeId, customerId: { in: customerIds }, status: "COMPLETED" },
    _sum: { total: true },
    _max: { createdAt: true },
    _count: { id: true },
  });

  const balances = await getCustomerBalances(customerIds);
  const enriched = customers.map((c) => {
    const stat = salesStats.find((s) => s.customerId === c.id);
    return {
      ...c,
      totalSpend: stat?._sum.total?.toNumber() ?? 0,
      lastVisit: stat?._max.createdAt ?? null,
      visitCount: stat?._count.id ?? 0,
      balance: balances.get(c.id) ?? 0,
    };
  });

  if (exporting) {
    return xlsxResponse({
      filename: "klienty",
      sheetName: "Клиенты",
      rows: [
        ["Имя", "Телефон", "Email", "Баллы", "Долг/баланс", "Визитов", "Сумма покупок", "Последний визит", "Заметки"],
        ...enriched.map((c) => [c.name, c.phone ?? "", c.email ?? "", c.loyaltyPoints, c.balance, c.visitCount, c.totalSpend, c.lastVisit ?? "", c.notes ?? ""]),
      ],
    });
  }

  return NextResponse.json({
    customers: enriched,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}

// ---- POST /api/customers (quick-create) ----
const createSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  notes: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { name, phone, email, notes } = parsed.data;
  const storeId = await getStoreId();

  try {
    const customer = await prisma.customer.create({
      data: { storeId, name, phone: phone || null, email: email || null, notes: notes || null },
      select: { id: true, name: true, phone: true, email: true },
    });
    return NextResponse.json({ customer }, { status: 201 });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "P2002") {
      return NextResponse.json({ error: "Клиент с таким телефоном или email уже есть" }, { status: 409 });
    }
    throw e;
  }
}
