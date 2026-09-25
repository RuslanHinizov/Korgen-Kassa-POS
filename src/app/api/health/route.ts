import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const started = Date.now();

// GET /api/health — for uptime monitors and the server watchdog. 200 only when the app AND the database answer.
export async function GET() {
  let db = false;
  try {
    await Promise.race([
      prisma.$queryRaw`select 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error("db timeout")), 3000)),
    ]);
    db = true;
  } catch { /* db stays false */ }
  return NextResponse.json({ ok: db, db, uptimeSec: Math.round((Date.now() - started) / 1000) }, { status: db ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
