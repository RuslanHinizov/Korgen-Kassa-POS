import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";

const FIELDS = [
  "posCollapseWindow", "posInstantSync", "posShowSalesHistory", "posNewReceiptFormat", "posGlobalSearch",
  "posUniversalProduct", "posCreateProduct", "posEditProductAtPos", "posHoldOrder", "posDiscount", "posCreditSale", "posCashInOut",
  "posSplitCounterparty", "posWholesaleAtPos",
  "posPriceCheck", "posBanPriceDecrease", "posChangePriceAtPos", "posCardPayment", "posSalesOverMillion",
  "posAccessReturn", "posAccessReturnNoReceipt", "posAccessDeleteItem", "posAccessDecreaseQty",
  "posRoundingWeightItems", "posRoundingDiscount",
] as const;

// GET /api/management/pos-permissions — Управление → Управление кассами → Настройка разрешений на кассе
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const storeId = await getStoreId();

  const settings = await prisma.businessSettings.upsert({ where: { storeId }, create: { storeId }, update: {} });
  const result: Record<string, unknown> = {};
  for (const f of FIELDS) result[f] = settings[f];
  return NextResponse.json({ permissions: result });
}

const accessRole = z.enum(["NOBODY", "ADMIN", "ALL"]);
const roundingMode = z.enum(["NONE", "UP_1", "DOWN_1", "UP_5", "DOWN_5", "UP_10", "DOWN_10", "UP_50", "DOWN_50", "UP_100", "DOWN_100"]);

const patchSchema = z.object({
  posCollapseWindow: z.boolean().optional(),
  posInstantSync: z.boolean().optional(),
  posShowSalesHistory: z.boolean().optional(),
  posNewReceiptFormat: z.boolean().optional(),
  posGlobalSearch: z.boolean().optional(),
  posUniversalProduct: z.boolean().optional(),
  posCreateProduct: z.boolean().optional(),
  posEditProductAtPos: z.boolean().optional(),
  posHoldOrder: z.boolean().optional(),
  posDiscount: z.boolean().optional(),
  posCreditSale: z.boolean().optional(),
  posCashInOut: z.boolean().optional(),
  posSplitCounterparty: z.boolean().optional(),
  posWholesaleAtPos: z.boolean().optional(),
  posPriceCheck: z.boolean().optional(),
  posBanPriceDecrease: z.boolean().optional(),
  posChangePriceAtPos: z.boolean().optional(),
  posCardPayment: z.boolean().optional(),
  posSalesOverMillion: z.boolean().optional(),
  posAccessReturn: accessRole.optional(),
  posAccessReturnNoReceipt: accessRole.optional(),
  posAccessDeleteItem: accessRole.optional(),
  posAccessDecreaseQty: accessRole.optional(),
  posRoundingWeightItems: roundingMode.optional(),
  posRoundingDiscount: roundingMode.optional(),
});

// PATCH /api/management/pos-permissions
export async function PATCH(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const storeId = await getStoreId();

  await prisma.businessSettings.upsert({ where: { storeId }, create: { storeId, ...parsed.data }, update: parsed.data });
  return NextResponse.json({ ok: true });
}
