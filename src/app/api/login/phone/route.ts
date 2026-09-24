import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";

const schema = z.object({ phone: z.string().min(1).max(60), password: z.string().min(1).max(200) });
const GENERIC = "Неверный номер телефона или пароль";

// Small in-memory brake against password guessing (per phone + client address).
const attempts = new Map<string, { count: number; resetAt: number }>();
function tooMany(key: string) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) { attempts.set(key, { count: 1, resetAt: now + 5 * 60_000 }); return false; }
  entry.count += 1;
  return entry.count > 10;
}

// POST /api/login/phone { phone, password } — sign in with a phone number instead of an e-mail.
// The account's internal e-mail is looked up here and never sent back to the browser.
export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: GENERIC }, { status: 400 });
  const identifier = parsed.data.phone.trim();

  const h = await headers();
  const client = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const phone = normalizePhone(identifier);
  if (tooMany(`${client}|${phone ?? identifier}`)) {
    return NextResponse.json({ error: "Слишком много попыток. Подождите несколько минут." }, { status: 429 });
  }

  // Transitional: staff who have no phone on file yet can still sign in with their old e-mail.
  const user = phone
    ? await prisma.user.findUnique({ where: { phone }, select: { email: true } })
    : identifier.includes("@") ? await prisma.user.findUnique({ where: { email: identifier }, select: { email: true } }) : null;
  if (!user) return NextResponse.json({ error: GENERIC }, { status: 401 });

  const res = await auth.api.signInEmail({ body: { email: user.email, password: parsed.data.password }, headers: h, asResponse: true });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const blocked = typeof body?.message === "string" && body.message.startsWith("Доступ закрыт");
    return NextResponse.json({ error: blocked ? body.message : GENERIC }, { status: res.status === 403 ? 403 : 401 });
  }
  const out = NextResponse.json({ ok: true });
  for (const cookie of res.headers.getSetCookie()) out.headers.append("set-cookie", cookie);
  return out;
}
