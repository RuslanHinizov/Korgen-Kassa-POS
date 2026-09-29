import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { createHubToken } from "@/lib/hub-auth";
import { buildTillPackageBody } from "@/lib/till-package";
import { serializePackage } from "@/lib/till-package-format";
import { redeemActivationCode, tooManyAttempts } from "@/lib/till-activation";

export const dynamic = "force-dynamic";

const schema = z.object({ code: z.string().min(1).max(20) });

/**
 * POST /api/till-activate { code } — no session: a brand-new till program has none. An 8-digit activation code from the
 * administrator (Управление → Кассы) is exchanged, once, for the market package with its start key. See plan §12.
 */
export async function POST(req: NextRequest) {
  const h = await headers();
  const client = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (tooManyAttempts(client)) return NextResponse.json({ error: "Слишком много попыток. Подождите несколько минут." }, { status: 429 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  const storeId = parsed.success ? await redeemActivationCode(parsed.data.code) : null;
  if (!storeId) return NextResponse.json({ error: "Код неверный, уже использован или срок его действия истёк." }, { status: 400 });

  const body = await buildTillPackageBody(storeId);
  if (!body) return NextResponse.json({ error: "Магазин не найден." }, { status: 404 });
  body.deviceToken = await createHubToken(storeId, `Активация кассы ${body.generatedAt.slice(0, 16).replace("T", " ")}`);
  return new NextResponse(await serializePackage(body), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}
