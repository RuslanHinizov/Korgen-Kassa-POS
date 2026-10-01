import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz";
function randomKey(length = 8) {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return out;
}

// POST /api/management/cashboxes/:id/generate-key — Сгенерировать одноразовый ключ.
// The terminal redeems this key via POST /api/pos/cashbox to pair itself to this cashbox.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const storeId = await getStoreId();
  const existing = await prisma.cashbox.findFirst({ where: { id, storeId } });
  if (!existing) return NextResponse.json({ error: "Касса не найдена" }, { status: 404 });

  const oneTimeKey = randomKey();
  const cashbox = await prisma.cashbox.update({ where: { id }, data: { oneTimeKey } });
  return NextResponse.json({ oneTimeKey: cashbox.oneTimeKey });
}
