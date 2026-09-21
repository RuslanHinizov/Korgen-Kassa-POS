import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";

// GET /api/finance/accounts/:id — Настройки счёта
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const storeId = await getStoreId();

  const account = await prisma.financeAccount.findFirst({ where: { id, storeId } });
  if (!account) return NextResponse.json({ error: "Счёт не найден" }, { status: 404 });

  return NextResponse.json({
    account: {
      id: account.id, name: account.name, type: account.type, balance: Number(account.balance),
      allowNegativeBalance: account.allowNegativeBalance, showAtPos: account.showAtPos,
    },
  });
}

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  type: z.enum(["CASH", "NONCASH"]).optional(),
  allowNegativeBalance: z.boolean().optional(),
  showAtPos: z.boolean().optional(),
});

// PATCH /api/finance/accounts/:id — edit account settings (balance is never edited directly here, only via payments)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const storeId = await getStoreId();

  const existing = await prisma.financeAccount.findFirst({ where: { id, storeId } });
  if (!existing) return NextResponse.json({ error: "Счёт не найден" }, { status: 404 });

  const account = await prisma.financeAccount.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ account });
}
