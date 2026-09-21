import { NextRequest, NextResponse } from "next/server";
import { headers, cookies } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { APP_VERSION } from "@/lib/app-version";
import { verifyPin } from "@/lib/pin";
import { CASHBOX_DEVICE_COOKIE, issueCashboxDeviceToken, getPairedCashboxId } from "@/lib/cashbox-device";

const MAX_AGE = 400 * 24 * 60 * 60; // ~13 months; re-pairing is manual, not time-boxed like the manager/kiosk tokens

/** GET /api/pos/cashbox — which Cashbox (if any) this terminal is currently paired to. */
export async function GET() {
  const jar = await cookies();
  const cashboxId = getPairedCashboxId(jar.get(CASHBOX_DEVICE_COOKIE)?.value);
  if (!cashboxId) return NextResponse.json({ cashbox: null });

  const storeId = await getStoreId();
  const cashbox = await prisma.cashbox.findFirst({ where: { id: cashboxId, storeId }, select: { id: true, no: true, name: true, active: true, lastSyncAt: true } });
  // The kiosk calls this on every load, so it doubles as the terminal's check-in heartbeat.
  if (cashbox && (!cashbox.lastSyncAt || Date.now() - cashbox.lastSyncAt.getTime() > 60_000)) {
    await prisma.cashbox.update({ where: { id: cashbox.id }, data: { lastSyncAt: new Date(), appVersion: APP_VERSION } });
  }
  return NextResponse.json({ cashbox: cashbox ?? null });
}

function describePlatform(ua: string | null): string {
  if (!ua) return "—";
  const os = /Windows/i.test(ua) ? "Windows" : /Android/i.test(ua) ? "Android" : /iPhone|iPad/i.test(ua) ? "iOS" : /Mac OS/i.test(ua) ? "macOS" : /Linux/i.test(ua) ? "Linux" : "Unknown";
  const browser = ua.includes("Edg/") ? "Edge" : ua.includes("Chrome/") ? "Chrome" : ua.includes("Firefox/") ? "Firefox" : ua.includes("Safari/") ? "Safari" : "Browser";
  return os + " / " + browser;
}

const pairSchema = z.object({ key: z.string().min(1) });

/** POST /api/pos/cashbox — redeem a cashbox's one-time pairing key (generated in
 * Управление кассами) to bind this terminal to it. Matches UMAG: entering the key on
 * the physical device is the whole flow, no admin login required on the terminal itself.
 * The key is single-use — it's cleared on redemption so a leaked key can't be reused. */
export async function POST(req: NextRequest) {
  const parsed = pairSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Введите ключ" }, { status: 400 });

  const storeId = await getStoreId();
  const cashbox = await prisma.cashbox.findFirst({ where: { storeId, oneTimeKey: parsed.data.key.trim() } });
  if (!cashbox) return NextResponse.json({ error: "Неверный или уже использованный ключ" }, { status: 404 });

  await prisma.cashbox.update({ where: { id: cashbox.id }, data: { oneTimeKey: null, pairedAt: new Date(), lastSyncAt: new Date(), appVersion: APP_VERSION, platform: describePlatform(req.headers.get("user-agent")) } });

  const jar = await cookies();
  jar.set(CASHBOX_DEVICE_COOKIE, issueCashboxDeviceToken(cashbox.id), {
    httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: MAX_AGE,
  });

  return NextResponse.json({ cashbox: { id: cashbox.id, no: cashbox.no, name: cashbox.name, active: cashbox.active } });
}

/** DELETE /api/pos/cashbox — un-pair this terminal (hardware repurposed/replaced).
 * Requires a real ADMIN/MANAGER session, or the store's manager PIN — this must never
 * be doable by a bored cashier, but also must never require reaching the admin panel. */
export async function DELETE(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  const privileged = !!session && ["ADMIN", "MANAGER"].includes(session.user.role ?? "");

  if (!privileged) {
    const body = await req.json().catch(() => null);
    const pin = typeof body?.pin === "string" ? body.pin : "";
    const storeId = await getStoreId();
    const settings = await prisma.businessSettings.findUnique({ where: { storeId }, select: { managerPin: true } });
    if (!settings?.managerPin) return NextResponse.json({ error: "no_pin_configured" }, { status: 409 });
    if (!pin || !verifyPin(pin, settings.managerPin)) {
      return NextResponse.json({ error: "Неверный PIN" }, { status: 403 });
    }
  }

  const jar = await cookies();
  jar.delete(CASHBOX_DEVICE_COOKIE);
  return NextResponse.json({ cashbox: null });
}
