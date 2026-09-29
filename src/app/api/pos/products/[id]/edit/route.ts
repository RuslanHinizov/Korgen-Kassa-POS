import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { hasKioskAccess } from "@/lib/kiosk-device";
import { logAudit } from "@/lib/audit";

const schema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    price: z.number().min(0).max(100_000_000).optional(),
  })
  .refine((d) => d.name !== undefined || d.price !== undefined, { message: "nothing to change" });

/**
 * POST /api/pos/products/:id/edit — «ИЗМЕНИТЬ ТОВАР» at the register: a cashier changes a product's name and/or selling
 * price for everyone (UMAG uploads the same kind of edit). The store's register permissions decide what is allowed:
 * name needs «Изменение товара на кассе», price needs «Изменение цены на кассе», and «Запретить понижать цену»
 * refuses a lower price. Setting the same values twice is harmless, so a queued upload can be retried freely.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const office = ["ADMIN", "MANAGER"].includes(session.user.role ?? "");
  if (!office && !(await hasKioskAccess())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Проверьте название и цену" }, { status: 400 });
  const d = parsed.data;

  const { id } = await params;
  const storeId = await getStoreId();
  const product = await prisma.product.findFirst({ where: { id, storeId, deletedAt: null }, select: { id: true, name: true, price: true } });
  if (!product) return NextResponse.json({ error: "Товар не найден" }, { status: 404 });

  const newName = d.name !== undefined && d.name !== product.name ? d.name : undefined;
  const oldPrice = Number(product.price);
  const newPrice = d.price !== undefined && Math.abs(d.price - oldPrice) > 0.0001 ? d.price : undefined;

  if (!office) {
    const s = await prisma.businessSettings.findUnique({
      where: { storeId },
      select: { posEditProductAtPos: true, posChangePriceAtPos: true, posBanPriceDecrease: true },
    });
    if (newName !== undefined && s && !s.posEditProductAtPos) return NextResponse.json({ error: "Изменение товара на кассе отключено администратором" }, { status: 403 });
    if (newPrice !== undefined && s && !s.posChangePriceAtPos) return NextResponse.json({ error: "Изменение цены на кассе отключено администратором" }, { status: 403 });
    if (newPrice !== undefined && s?.posBanPriceDecrease && newPrice < oldPrice) return NextResponse.json({ error: "Понижать цену на кассе запрещено" }, { status: 403 });
  }

  if (newName === undefined && newPrice === undefined) return NextResponse.json({ ok: true, unchanged: true });

  const updated = await prisma.product.update({
    where: { id },
    data: { ...(newName !== undefined ? { name: newName } : {}), ...(newPrice !== undefined ? { price: newPrice } : {}) },
    select: { id: true, name: true, price: true },
  });
  if (newPrice !== undefined) {
    await logAudit({ userId: session.user.id, action: "PRICE_OVERRIDE", entityType: "Product", entityId: id, details: { from: oldPrice, to: newPrice, at: "register" } }).catch(() => {});
  }
  return NextResponse.json({ ok: true, product: { id: updated.id, name: updated.name, price: Number(updated.price) } });
}
