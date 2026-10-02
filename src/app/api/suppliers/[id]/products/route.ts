import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { counterpartyScope } from "@/lib/counterparty-scope";
import { getStoreId } from "@/lib/store-context";

const ROLES = ["ADMIN", "MANAGER", "WAREHOUSE"];

async function authorize(id: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !ROLES.includes(session.user.role ?? "")) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const storeId = await getStoreId();
  const supplier = await prisma.supplier.findFirst({ where: { id, ...(await counterpartyScope(storeId)) }, select: { id: true, name: true } });
  if (!supplier) return { error: NextResponse.json({ error: "Поставщик не найден" }, { status: 404 }) };
  return { storeId, supplier };
}

/** GET /api/suppliers/:id/products — «Товары поставщика»: the products tied to this supplier (page by page, searchable). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await authorize(id);
  if (a.error) return a.error;
  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim();
  const pageSize = Math.min(200, Math.max(1, Number(sp.get("pageSize")) || 100));
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const where = {
    storeId: a.storeId, supplierId: id, deletedAt: null,
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { barcode: { contains: q } }] } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where, orderBy: { name: "asc" }, skip: (page - 1) * pageSize, take: pageSize,
      select: { id: true, name: true, barcode: true, cost: true, price: true, stock: true, unit: true },
    }),
  ]);
  return NextResponse.json({
    total, page, pageSize,
    products: rows.map((p) => ({ id: p.id, name: p.name, barcode: p.barcode, cost: p.cost == null ? null : Number(p.cost), price: Number(p.price), stock: Number(p.stock), unit: p.unit })),
  });
}

const addSchema = z.object({ productId: z.string().min(1) });

/** POST — tie a product to this supplier («Добавление по названию/штрихкоду»). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await authorize(id);
  if (a.error) return a.error;
  const parsed = addSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Выберите товар" }, { status: 400 });
  const product = await prisma.product.findFirst({ where: { id: parsed.data.productId, storeId: a.storeId, deletedAt: null }, select: { id: true } });
  if (!product) return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
  await prisma.product.update({ where: { id: product.id }, data: { supplierId: id } });
  return NextResponse.json({ ok: true });
}

/** DELETE ?productId= — take a product off this supplier (the product itself stays). */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await authorize(id);
  if (a.error) return a.error;
  const productId = req.nextUrl.searchParams.get("productId") ?? "";
  const result = await prisma.product.updateMany({ where: { id: productId, storeId: a.storeId, supplierId: id }, data: { supplierId: null } });
  if (result.count === 0) return NextResponse.json({ error: "Товар не найден у этого поставщика" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
