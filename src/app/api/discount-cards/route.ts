import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { counterpartyScope } from "@/lib/counterparty-scope";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";

// GET /api/discount-cards            — list (privileged)
// GET /api/discount-cards?code=XXX   — single lookup for the POS (any signed-in user)
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const storeId = await getStoreId();

  const code = req.nextUrl.searchParams.get("code");
  if (code) {
    const card = await prisma.discountCard.findFirst({
      where: { code: code.trim(), storeId },
      select: { id: true, code: true, holderName: true, percent: true, active: true },
    });
    if (!card || !card.active) return NextResponse.json({ error: "Карта не найдена" }, { status: 404 });
    return NextResponse.json({ card: { ...card, percent: Number(card.percent) } });
  }

  if (!["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const cards = await prisma.discountCard.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
    include: { customer: { select: { name: true } } },
  });
  return NextResponse.json({ cards: cards.map((c) => ({ ...c, percent: Number(c.percent) })) });
}

const createSchema = z.object({
  code: z.string().min(2).max(64),
  holderName: z.string().max(120).optional(),
  percent: z.number().min(0).max(100),
  customerId: z.string().optional().nullable(),
});

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const storeId = await getStoreId();
  if (parsed.data.customerId) {
    const customer = await prisma.customer.findFirst({ where: { id: parsed.data.customerId, ...(await counterpartyScope(storeId)) } });
    if (!customer) return NextResponse.json({ error: "Покупатель не найден" }, { status: 404 });
  }
  try {
    const card = await prisma.discountCard.create({ data: { ...parsed.data, storeId, code: parsed.data.code.trim() } });
    return NextResponse.json({ card }, { status: 201 });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "Такой код уже зарегистрирован" }, { status: 409 });
    }
    throw e;
  }
}
