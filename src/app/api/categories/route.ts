import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1).max(120),
  parentId: z.string().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  defaultMarkup: z.number().min(0).max(1000).optional().nullable(),
  cashbackPercent: z.number().min(0).max(100).optional().nullable(),
});

// GET /api/categories  — flat list, ordered, with product counts
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const storeId = await getStoreId();

  const categories = await prisma.category.findMany({
    where: { storeId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { products: { where: { deletedAt: null } } } } },
  });
  return NextResponse.json({
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      parentId: c.parentId,
      sortOrder: c.sortOrder,
      imageUrl: c.imageUrl,
      defaultMarkup: c.defaultMarkup,
      cashbackPercent: c.cashbackPercent,
      productCount: c._count.products,
    })),
  });
}

// POST /api/categories  — create
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const storeId = await getStoreId();
  if (parsed.data.parentId) {
    const parent = await prisma.category.findFirst({ where: { id: parsed.data.parentId, storeId } });
    if (!parent) return NextResponse.json({ error: "Родительская категория не найдена" }, { status: 404 });
  }
  const last = await prisma.category.findFirst({ where: { storeId }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  try {
    const category = await prisma.category.create({
      data: {
        storeId,
        name: parsed.data.name.trim(),
        parentId: parsed.data.parentId || null,
        imageUrl: parsed.data.imageUrl || null,
        defaultMarkup: parsed.data.defaultMarkup ?? null,
        cashbackPercent: parsed.data.cashbackPercent ?? null,
        sortOrder: (last?.sortOrder ?? 0) + 1,
      },
    });
    return NextResponse.json({ category }, { status: 201 });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "Категория с таким названием уже существует" }, { status: 409 });
    }
    throw e;
  }
}
