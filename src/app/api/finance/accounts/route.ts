import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";

// GET /api/finance/accounts — Финансы → Обзор счетов
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const storeId = await getStoreId();

  const accounts = await prisma.financeAccount.findMany({ where: { storeId }, orderBy: { createdAt: "asc" } });
  return NextResponse.json({
    accounts: accounts.map((a) => ({
      id: a.id, name: a.name, type: a.type, balance: Number(a.balance),
      allowNegativeBalance: a.allowNegativeBalance, showAtPos: a.showAtPos,
    })),
  });
}

const createSchema = z.object({
  name: z.string().min(1).max(120),
  type: z.enum(["CASH", "NONCASH"]),
  balance: z.number().default(0),
  allowNegativeBalance: z.boolean().default(false),
  showAtPos: z.boolean().default(false),
});

// POST /api/finance/accounts — Создание счёта
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const storeId = await getStoreId();

  const account = await prisma.financeAccount.create({ data: { ...parsed.data, storeId } });
  return NextResponse.json({ account }, { status: 201 });
}
