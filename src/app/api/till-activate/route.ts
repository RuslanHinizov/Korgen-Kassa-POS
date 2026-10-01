import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { createHubToken, revokeHubTokenSecret } from "@/lib/hub-auth";
import { prisma } from "@/lib/db";
import { normalizeCode } from "@/lib/till-activation";
import { buildTillPackageBody } from "@/lib/till-package";
import { serializePackage } from "@/lib/till-package-format";
import { tooManyAttempts } from "@/lib/till-activation";

export const dynamic = "force-dynamic";

const schema = z.object({ code: z.string().min(1).max(20) });

/**
 * POST /api/till-activate { code } — no session: a brand-new till program has none. Redeems the one-use code
 * created together with a specific cashbox, binding this installation permanently to that cashbox.
 */
export async function POST(req: NextRequest) {
  const h = await headers();
  const client = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (tooManyAttempts(client)) return NextResponse.json({ error: "Слишком много попыток. Подождите несколько минут." }, { status: 429 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Код неверный, уже использован или срок его действия истёк." }, { status: 400 });

  // New cashboxes carry a permanent, one-use setup code from the moment they are created. Redeeming it
  // binds the till directly to that register; the same code cannot pair a second device.
  const digits = normalizeCode(parsed.data.code);
  const setupCashbox = digits ? await prisma.cashbox.findFirst({
    where: { oneTimeKey: digits, pairedAt: null, active: true },
    select: { id: true, storeId: true, name: true },
  }) : null;
  if (!setupCashbox || !digits) return NextResponse.json({ error: "Код неверный, уже использован или касса отключена." }, { status: 400 });
  const body = await buildTillPackageBody(setupCashbox.storeId);
  if (!body) return NextResponse.json({ error: "Магазин не найден." }, { status: 404 });
  body.cashbox = { id: setupCashbox.id, name: setupCashbox.name };
  const now = new Date();
  const token = await createHubToken(setupCashbox.storeId, `Касса ${setupCashbox.name}`, setupCashbox.id);
  body.deviceToken = token;
  let packageText: string;
  try {
    packageText = await serializePackage(body);
  } catch (error) {
    await revokeHubTokenSecret(token).catch(() => {});
    throw error;
  }
  let claimed: { count: number };
  try {
    claimed = await prisma.cashbox.updateMany({
      where: { id: setupCashbox.id, storeId: setupCashbox.storeId, oneTimeKey: digits, pairedAt: null, active: true },
      data: { oneTimeKey: null, pairedAt: now, lastSyncAt: now, appVersion: req.headers.get("x-korgen-version")?.slice(0, 20) ?? null, platform: "Windows (программа кассы)" },
    });
  } catch (error) {
    await revokeHubTokenSecret(token).catch(() => {});
    throw error;
  }
  if (claimed.count !== 1) {
    await revokeHubTokenSecret(token).catch(() => {});
    return NextResponse.json({ error: "Код уже использован или касса отключена." }, { status: 409 });
  }
  return new NextResponse(packageText, { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}
