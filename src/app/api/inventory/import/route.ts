import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";
import { applyInventoryMovement } from "@/lib/inventory-ledger";
import { logAudit } from "@/lib/audit";

const row = z.object({ name: z.string().min(1).max(255), sku: z.string().optional().nullable(), barcode: z.string().optional().nullable(), scalePlu: z.string().regex(/^\d{5}$/).optional().nullable(), price: z.number().min(0), cost: z.number().min(0).optional().nullable(), stock: z.number().min(0).default(0), unit: z.enum(["pcs", "kg", "l", "m"]).default("pcs"), category: z.string().optional().nullable(), lowStockThreshold: z.number().int().min(0).default(5) });
const schema = z.object({ rows: z.array(row).min(1).max(2000) });

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const result = { created: 0, updated: 0, restored: 0, errors: [] as string[] };
  const storeId = await getStoreId();
  const settings = await prisma.businessSettings.findUnique({ where: { storeId }, select: { autoRestoreDeletedProducts: true } });
  const autoRestore = Boolean(settings?.autoRestoreDeletedProducts);
  await prisma.$transaction(async (tx) => { for (let index = 0; index < parsed.data.rows.length; index++) { const r = parsed.data.rows[index]; try { const key = r.barcode ? { barcode: r.barcode, storeId } : r.sku ? { sku: r.sku, storeId } : null; const existing = key ? await tx.product.findFirst({ where: { ...key, deletedAt: null } }) : null; const deletedMatch = !existing && key && autoRestore ? await tx.product.findFirst({ where: { ...key, deletedAt: { not: null } } }) : null; if (existing || deletedMatch) { const target = existing ?? deletedMatch!; const oldStock = Number(target.stock); await tx.product.update({ where: { id: target.id }, data: { name: r.name, sku: r.sku || null, barcode: r.barcode || null, scalePlu: r.scalePlu || null, price: r.price, cost: r.cost ?? null, unit: r.unit, category: r.category || null, lowStockThreshold: r.lowStockThreshold, ...(deletedMatch ? { deletedAt: null } : {}) } }); const delta = r.stock - oldStock; if (delta !== 0) await applyInventoryMovement(tx, { productId: target.id, userId: session.user.id, type: "IMPORT", quantity: delta, referenceType: "ExcelImport", note: "Excel/CSV import" }); if (deletedMatch) result.restored++; else result.updated++; } else { const product = await tx.product.create({ data: { ...r, storeId, sku: r.sku || null, barcode: r.barcode || null, scalePlu: r.scalePlu || null, category: r.category || null, cost: r.cost ?? null, stock: 0 } }); if (r.stock) await applyInventoryMovement(tx, { productId: product.id, userId: session.user.id, type: "IMPORT", quantity: r.stock, referenceType: "ExcelImport", note: "Excel/CSV import" }); result.created++; } } catch (error) { result.errors.push(`Строка ${index + 2}: ${error instanceof Error ? error.message : "не удалось обработать"}`); } } });
  await logAudit({ userId: session.user.id, action: "STOCK_RECEIPT", entityType: "ExcelImport", details: result });
  return NextResponse.json(result);
}
