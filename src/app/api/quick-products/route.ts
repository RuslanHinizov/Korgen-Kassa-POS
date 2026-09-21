import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";

const createSchema = z.object({
  productId: z.string().min(1),
  groupId: z.string().optional().nullable(),
  displayName: z.string().max(120).optional().nullable(),
});

const PRODUCT_SELECT = {
  id: true, name: true, price: true, stock: true, unit: true, barcode: true, categoryId: true, active: true,
} as const;

// GET /api/quick-products — all buttons, ordered, with their linked product's live price/stock
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const storeId = await getStoreId();
  const groupId = req.nextUrl.searchParams.get("groupId");
  const items = await prisma.quickProduct.findMany({
    where: { product: { storeId, deletedAt: null }, ...(groupId ? { groupId } : {}) },
    orderBy: [{ sortOrder: "asc" }],
    include: { product: { select: PRODUCT_SELECT } },
  });
  return NextResponse.json({
    items: items.map((i) => ({
      id: i.id,
      groupId: i.groupId,
      displayName: i.displayName,
      sortOrder: i.sortOrder,
      product: i.product ? { ...i.product, price: Number(i.product.price), stock: Number(i.product.stock) } : null,
    })),
  });
}

// POST /api/quick-products — add a product as a quick-tap button
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { productId, groupId, displayName } = parsed.data;
  const storeId = await getStoreId();

  const product = await prisma.product.findFirst({ where: { id: productId, storeId, deletedAt: null }, select: { id: true } });
  if (!product) return NextResponse.json({ error: "Товар не найден" }, { status: 404 });

  if (groupId) {
    const group = await prisma.quickProductGroup.findFirst({ where: { id: groupId, storeId } });
    if (!group) return NextResponse.json({ error: "Группа не найдена" }, { status: 404 });
  }

  const last = await prisma.quickProduct.findFirst({
    where: { product: { storeId }, ...(groupId ? { groupId } : { groupId: null }) },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const item = await prisma.quickProduct.create({
    data: {
      productId,
      groupId: groupId || null,
      displayName: displayName?.trim() || null,
      sortOrder: (last?.sortOrder ?? 0) + 1,
    },
    include: { product: { select: PRODUCT_SELECT } },
  });
  return NextResponse.json(
    { item: { ...item, product: { ...item.product, price: Number(item.product.price), stock: Number(item.product.stock) } } },
    { status: 201 },
  );
}
