import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { logAudit } from "@/lib/audit";

const FLAGS = [
  "autoUpdateCostPrice", "autoUpdateSalePrice", "autoUpdateBundleSalePrice", "autoRestoreDeletedProducts",
  "posSplitCounterparty", "hideStockDuringStocktake", "bindProductToSupplier", "mergeSameProducts",
  "autosaveReceiptDraft", "cashbackEnabled", "allowWholesale", "hideAmountsDuringStocktake",
] as const;

async function requireStaff() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) return null;
  return session;
}

// GET /api/management/site-permissions — «Настройка разрешений на сайте»
export async function GET() {
  if (!(await requireStaff())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const storeId = await getStoreId();
  const s = await prisma.businessSettings.findUnique({ where: { storeId } });
  if (!s) return NextResponse.json({ error: "Настройки магазина не найдены" }, { status: 404 });
  return NextResponse.json({
    flags: { ...Object.fromEntries(FLAGS.map((f) => [f, Boolean(s[f])])), cashbackEnabled: s.loyaltyEnabled },
    backdatingDays: s.backdatingDays,
    roundSalePriceUp: s.roundSalePriceUp,
  });
}

const schema = z.object({
  flags: z.object(Object.fromEntries(FLAGS.map((f) => [f, z.boolean()])) as Record<(typeof FLAGS)[number], z.ZodBoolean>),
  backdatingDays: z.number().int().min(0).max(3650),
  roundSalePriceUp: z.boolean(),
});

// PATCH /api/management/site-permissions
export async function PATCH(req: NextRequest) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Некорректные значения" }, { status: 400 });
  const { flags, backdatingDays, roundSalePriceUp } = parsed.data;

  const storeId = await getStoreId();
  if (!(await prisma.businessSettings.findUnique({ where: { storeId }, select: { id: true } }))) {
    return NextResponse.json({ error: "Настройки магазина не найдены" }, { status: 404 });
  }
  await prisma.businessSettings.update({
    where: { storeId },
    // «Включить систему лояльности с cashback» switches loyalty and cashback together.
    data: { ...flags, loyaltyEnabled: flags.cashbackEnabled, backdatingDays, roundSalePriceUp },
  });
  await logAudit({ userId: session.user.id, action: "SETTINGS_UPDATE", entityType: "BusinessSettings", details: { section: "site-permissions" } });
  return NextResponse.json({ ok: true });
}
