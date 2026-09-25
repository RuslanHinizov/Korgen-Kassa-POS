import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { hasKioskAccess } from "@/lib/kiosk-device";
import { generateEan13 } from "@/lib/barcode";
import { applyInventoryMovement } from "@/lib/inventory-ledger";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  name: z.string().trim().min(1).max(200),
  price: z.number().positive().max(100_000_000),
  barcode: z.string().trim().regex(/^[A-Za-z0-9-]{4,30}$/).optional().or(z.literal("")),
  unit: z.enum(["pcs", "kg", "l", "m"]).default("pcs"),
  stock: z.number().min(0).max(1_000_000).default(1),
  /** purchase price, sent when a product is created while receiving goods (Приёмка) */
  cost: z.number().min(0).max(100_000_000).optional(),
});

// POST /api/pos/products — a cashier adds a product that is missing from the catalogue, right at the
// kassa. It is a bare-minimum product (no cost, no category) that the admin completes later from Товары;
// every creation is logged with who made it.
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const office = ["ADMIN", "MANAGER"].includes(session.user.role ?? "");
  if (!office && !(await hasKioskAccess())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const storeId = await getStoreId();
  if (!office) {
    const settings = await prisma.businessSettings.findUnique({ where: { storeId }, select: { posCreateProduct: true } });
    if (settings && !settings.posCreateProduct) {
      return NextResponse.json({ error: "Создание товаров на кассе отключено администратором" }, { status: 403 });
    }
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Проверьте название и цену (цена больше нуля)" }, { status: 400 });
  const d = parsed.data;

  const barcode = d.barcode || null;
  if (barcode) {
    const existing = await prisma.product.findFirst({ where: { storeId, barcode }, select: { name: true, deletedAt: true } });
    if (existing) {
      return NextResponse.json({ error: `Товар с таким штрихкодом уже есть: «${existing.name}»${existing.deletedAt ? " (удалён)" : ""}` }, { status: 409 });
    }
  }

  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = barcode ?? generateEan13();
    try {
      const product = await prisma.$transaction(async (tx) => {
        const created = await tx.product.create({
          data: { storeId, name: d.name, barcode: candidate, price: d.price, cost: d.cost ?? 0, stock: 0, unit: d.unit },
          select: { id: true, name: true, price: true, stock: true, lowStockThreshold: true, barcode: true, unit: true },
        });
        if (d.stock > 0) {
          await applyInventoryMovement(tx, { productId: created.id, userId: session.user.id, type: "OPENING_BALANCE", quantity: d.stock, note: "Создан на кассе" });
        }
        return created;
      });
      await logAudit({ userId: session.user.id, action: "PRODUCT_CREATE", entityType: "Product", entityId: product.id, details: { name: d.name, barcode: candidate, price: d.price, cost: d.cost, stock: d.stock, source: d.cost !== undefined ? "receipt" : "pos" } });
      return NextResponse.json({
        product: {
          id: product.id, name: product.name, price: Number(product.price), wholesalePrice: null, stock: d.stock,
          lowStockThreshold: product.lowStockThreshold, sku: null, barcode: product.barcode, scalePlu: null,
          category: null, categoryId: null, imageUrl: null, unit: product.unit,
        },
      }, { status: 201 });
    } catch (e) {
      // A generated barcode collided with an existing one — try another; a typed one can't collide (checked above).
      if ((e as { code?: string })?.code === "P2002" && !barcode) continue;
      if ((e as { code?: string })?.code === "P2002") return NextResponse.json({ error: "Товар с таким штрихкодом уже есть" }, { status: 409 });
      throw e;
    }
  }
  return NextResponse.json({ error: "Не удалось создать уникальный штрихкод" }, { status: 503 });
}
