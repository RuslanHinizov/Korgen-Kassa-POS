import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { APP_VERSION } from "@/lib/app-version";
import { CASHBOX_DEVICE_COOKIE, issueCashboxDeviceToken, getPairedCashboxId } from "@/lib/cashbox-device";
import { resolveHubActor } from "@/lib/hub-auth";

const MAX_AGE = 10 * 365 * 24 * 60 * 60;

/** GET /api/pos/cashbox — which Cashbox (if any) this terminal is currently paired to. */
export async function GET(req: NextRequest) {
  const authorization = req.headers.get("authorization") ?? "";
  if (authorization.startsWith("Bearer hub_")) {
    const hub = await resolveHubActor(req);
    if (!hub) return NextResponse.json({ error: "Касса отключена" }, { status: 401 });
    if (!hub.cashboxId) return NextResponse.json({ cashbox: null, fixed: true });
    const cashbox = await prisma.cashbox.findFirst({ where: { id: hub.cashboxId, storeId: hub.storeId }, select: { id: true, no: true, name: true, active: true, lastSyncAt: true } });
    return NextResponse.json({ cashbox, fixed: true });
  }
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
  if ((req.headers.get("authorization") ?? "").startsWith("Bearer hub_")) {
    return NextResponse.json({ error: "Касса закреплена при первом подключении" }, { status: 403 });
  }
  const parsed = pairSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Введите ключ" }, { status: 400 });

  const storeId = await getStoreId();
  const cashbox = await prisma.cashbox.findFirst({ where: { storeId, oneTimeKey: parsed.data.key.trim(), pairedAt: null, active: true } });
  if (!cashbox) return NextResponse.json({ error: "Неверный или уже использованный ключ" }, { status: 404 });

  const claimed = await prisma.cashbox.updateMany({
    where: { id: cashbox.id, storeId, oneTimeKey: parsed.data.key.trim(), pairedAt: null, active: true },
    data: { oneTimeKey: null, pairedAt: new Date(), lastSyncAt: new Date(), appVersion: APP_VERSION, platform: describePlatform(req.headers.get("user-agent")) },
  });
  if (claimed.count !== 1) return NextResponse.json({ error: "Код уже использован" }, { status: 409 });

  const jar = await cookies();
  jar.set(CASHBOX_DEVICE_COOKIE, issueCashboxDeviceToken(cashbox.id), {
    // Not `secure`: this app is deployed over plain http (self-hosted, no TLS — see
    // BETTER_AUTH_URL). A Secure cookie is silently dropped by the browser off `localhost`,
    // which made the kiosk's cashbox pairing "disappear" on every reload/restart. Match the
    // other kiosk cookies (manager-token, acting-cashier): httpOnly + sameSite lax only.
    httpOnly: true, sameSite: "lax", path: "/", maxAge: MAX_AGE,
  });

  return NextResponse.json({ cashbox: { id: cashbox.id, no: cashbox.no, name: cashbox.name, active: cashbox.active } });
}
