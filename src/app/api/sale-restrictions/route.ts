import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";

const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;

const createSchema = z.object({
  categoryId: z.string().min(1),
  startTime: z.string().regex(timeRe),
  endTime: z.string().regex(timeRe),
  daysOfWeek: z.string().optional().nullable(),
});

// GET /api/sale-restrictions — all rules, newest first, with category name
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const storeId = await getStoreId();

  const rules = await prisma.saleRestriction.findMany({
    where: { category: { storeId } },
    orderBy: { createdAt: "desc" },
    include: { category: { select: { name: true } } },
  });
  return NextResponse.json({
    rules: rules.map((r) => ({
      id: r.id, categoryId: r.categoryId, categoryName: r.category.name,
      active: r.active, daysOfWeek: r.daysOfWeek, startTime: r.startTime, endTime: r.endTime,
    })),
  });
}

// POST /api/sale-restrictions — create a category+time-window sale ban
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { categoryId, startTime, endTime, daysOfWeek } = parsed.data;
  const storeId = await getStoreId();

  const category = await prisma.category.findFirst({ where: { id: categoryId, storeId }, select: { id: true } });
  if (!category) return NextResponse.json({ error: "Категория не найдена" }, { status: 404 });

  const rule = await prisma.saleRestriction.create({
    data: { categoryId, startTime, endTime, daysOfWeek: daysOfWeek || null },
    include: { category: { select: { name: true } } },
  });
  return NextResponse.json({ rule: { ...rule, categoryName: rule.category.name } }, { status: 201 });
}
