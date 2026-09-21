import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { resolvePosActor } from "@/lib/pos-actor";
import { logAudit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

/** Kassa cashier, or an administrator/manager previewing the kassa. */
async function getActor() {
  const actor = await resolvePosActor();
  if (actor) return actor;
  const session = await auth.api.getSession({ headers: await headers() });
  if (session && ["ADMIN", "MANAGER"].includes(session.user.role ?? "")) return { userId: session.user.id, role: session.user.role ?? "" };
  return null;
}

/** "Поиск по глобальной базе": the catalogues of the company's other stores. Products whose
 * barcode already exists in this store are hidden — those are found by the normal search. */
export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const storeId = await getStoreId();
  const settings = await prisma.businessSettings.findUnique({ where: { storeId }, select: { posGlobalSearch: true } });
  if (!settings?.posGlobalSearch) return NextResponse.json({ error: "Поиск по глобальной базе отключён" }, { status: 403 });

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ products: [] });

  const found = await prisma.product.findMany({
    where: {
      storeId: { not: storeId }, active: true, deletedAt: null,
      OR: [{ name: { contains: q, mode: "insensitive" } }, { barcode: { equals: q } }, { sku: { contains: q, mode: "insensitive" } }],
    },
    select: { id: true, name: true, barcode: true, price: true, unit: true, store: { select: { name: true } } },
    orderBy: { name: "asc" },
    take: 60,
  });
  const candidateBarcodes = found.map((p) => p.barcode).filter((b): b is string => Boolean(b));
  const local = candidateBarcodes.length
    ? await prisma.product.findMany({ where: { storeId, deletedAt: null, barcode: { in: candidateBarcodes } }, select: { barcode: true } })
    : [];
  const localBarcodes = new Set(local.map((p) => p.barcode));
  const products = found
    .filter((p) => !p.barcode || !localBarcodes.has(p.barcode))
    .slice(0, 20)
    .map((p) => ({ id: p.id, name: p.name, barcode: p.barcode, price: Number(p.price), unit: p.unit, storeName: p.store.name }));
  return NextResponse.json({ products });
}

const addSchema = z.object({ sourceProductId: z.string().min(1) });

/** Copies a product from another store into this store's catalogue (no stock, no cost). */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = addSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });

  const storeId = await getStoreId();
  const settings = await prisma.businessSettings.findUnique({ where: { storeId }, select: { posGlobalSearch: true, posEditProductAtPos: true } });
  if (!settings?.posGlobalSearch) return NextResponse.json({ error: "Поиск по глобальной базе отключён" }, { status: 403 });
  if (!settings.posEditProductAtPos) return NextResponse.json({ error: "Добавление товаров на кассе запрещено настройками" }, { status: 403 });

  const source = await prisma.product.findFirst({ where: { id: parsed.data.sourceProductId, storeId: { not: storeId }, deletedAt: null } });
  if (!source) return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
  if (source.barcode) {
    const exists = await prisma.product.findFirst({ where: { storeId, barcode: source.barcode, deletedAt: null }, select: { id: true } });
    if (exists) return NextResponse.json({ error: "Товар с таким штрихкодом уже есть в каталоге" }, { status: 409 });
  }

  const created = await prisma.product.create({
    data: {
      storeId, name: source.name, barcode: source.barcode, ntin: source.ntin, price: source.price, unit: source.unit,
      productType: "REGULAR", category: source.category, active: true, stock: 0,
    },
  });
  await logAudit({ userId: actor.userId, action: "PRODUCT_CREATE", entityType: "Product", entityId: created.id, details: { fromGlobalBase: source.id } });
  return NextResponse.json({ product: { id: created.id, name: created.name, barcode: created.barcode, price: Number(created.price) } }, { status: 201 });
}
