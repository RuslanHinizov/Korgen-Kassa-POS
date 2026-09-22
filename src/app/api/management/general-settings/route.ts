import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { logAudit } from "@/lib/audit";
import { hashPin } from "@/lib/pin";

async function requireStaff() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) return null;
  return session;
}

// GET /api/management/general-settings — «Управление → Настройки»
export async function GET() {
  if (!(await requireStaff())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const storeId = await getStoreId();
  const s = await prisma.businessSettings.upsert({ where: { storeId }, create: { storeId }, update: {} });
  return NextResponse.json({
    name: s.name,
    logoUrl: s.logoUrl,
    primaryColor: s.primaryColor,
    accentColor: s.accentColor,
    currency: s.currency,
    currencyDecimals: s.currencyDecimals,
    taxRate: s.taxRate.toString(),
    taxName: s.taxName,
    language: s.language,
    loyaltyEarnRate: s.loyaltyEarnRate.toString(),
    loyaltyRedeemValue: s.loyaltyRedeemValue.toString(),
    lowStockThreshold: s.lowStockThreshold,
    maxCashierDiscountPercent: s.maxCashierDiscountPercent.toString(),
    requireOpenShift: s.requireOpenShift,
    hasManagerPin: !!s.managerPin,
    storageProvider: s.storageProvider,
    storageRegion: s.storageRegion,
    storageBucket: s.storageBucket,
    storageEndpoint: s.storageEndpoint,
    storageAccessKey: s.storageAccessKey,
    hasStorageSecretKey: !!s.storageSecretKey,
    storagePublicUrl: s.storagePublicUrl,
  });
}

const schema = z.object({
  name: z.string().min(1),
  // No length cap: legacy stores may still have a base64 data URI here from
  // before uploads went through /api/upload — see the client schema for why.
  logoUrl: z.string().optional().or(z.literal("")),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  currency: z.string().min(1).max(5),
  currencyDecimals: z.number().int().min(0).max(4),
  taxRate: z.number().min(0).max(100),
  taxName: z.string().min(1),
  language: z.string().min(2).max(10),
  loyaltyEarnRate: z.number().min(0),
  loyaltyRedeemValue: z.number().min(1),
  lowStockThreshold: z.number().int().min(0),
  maxCashierDiscountPercent: z.number().min(0).max(100),
  requireOpenShift: z.boolean(),
  managerPin: z.string().default(""),
  storageProvider: z.string().default("local"),
  storageRegion: z.string().default(""),
  storageBucket: z.string().default(""),
  storageEndpoint: z.string().default(""),
  storageAccessKey: z.string().default(""),
  storageSecretKey: z.string().default(""),
  storagePublicUrl: z.string().default(""),
});

// PATCH /api/management/general-settings — updates only this section's own fields,
// never the Receipt (Управление чеком) or Permissions (Настройка разрешений) columns
// that live on the same BusinessSettings row but are edited from their own pages.
export async function PATCH(req: NextRequest) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Некорректные значения" }, { status: 400 });
  const v = parsed.data;

  const storeId = await getStoreId();
  if (!(await prisma.businessSettings.findUnique({ where: { storeId }, select: { id: true } }))) {
    return NextResponse.json({ error: "Настройки магазина не найдены" }, { status: 404 });
  }

  let pinPatch: { managerPin?: string | null } = {};
  if (v.managerPin === "__CLEAR__") pinPatch = { managerPin: null };
  else if (v.managerPin.trim().length >= 4) pinPatch = { managerPin: hashPin(v.managerPin.trim()) };

  await prisma.businessSettings.update({
    where: { storeId },
    data: {
      name: v.name,
      logoUrl: v.logoUrl || null,
      primaryColor: v.primaryColor,
      accentColor: v.accentColor,
      currency: v.currency,
      currencyDecimals: v.currencyDecimals,
      taxRate: v.taxRate / 100,
      taxName: v.taxName,
      language: v.language,
      loyaltyEarnRate: v.loyaltyEarnRate,
      loyaltyRedeemValue: v.loyaltyRedeemValue,
      lowStockThreshold: v.lowStockThreshold,
      maxCashierDiscountPercent: v.maxCashierDiscountPercent,
      requireOpenShift: v.requireOpenShift,
      ...pinPatch,
      storageProvider: v.storageProvider,
      storageRegion: v.storageRegion || null,
      storageBucket: v.storageBucket || null,
      storageEndpoint: v.storageEndpoint || null,
      storageAccessKey: v.storageAccessKey || null,
      ...(v.storageSecretKey ? { storageSecretKey: v.storageSecretKey } : {}),
      storagePublicUrl: v.storagePublicUrl || null,
    },
  });
  await logAudit({ userId: session.user.id, action: "SETTINGS_UPDATE", entityType: "BusinessSettings", details: { section: "general" } });
  return NextResponse.json({ ok: true });
}
