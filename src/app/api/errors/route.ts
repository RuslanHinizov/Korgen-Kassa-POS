import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { recordError } from "@/lib/error-report";
import { getStoreId } from "@/lib/store-context";

export const dynamic = "force-dynamic";

// small brake so a page stuck in an error loop cannot flood the database: 30 reports / 10 min per address
const hits = new Map<string, { n: number; resetAt: number }>();
function limited(key: string) {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.resetAt < now) { hits.set(key, { n: 1, resetAt: now + 600_000 }); return false; }
  h.n += 1;
  return h.n > 30;
}

// POST /api/errors { message, stack?, path?, kind? } — an error the browser saw. Works signed-out too
// (login-page errors), then it is simply reported without a user.
export async function POST(req: NextRequest) {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (limited(ip)) return new NextResponse(null, { status: 429 });

  const data = await req.json().catch(() => null);
  const message = typeof data?.message === "string" ? data.message : "";
  if (!message) return new NextResponse(null, { status: 204 });

  let actor: { userId: string; storeId: string | null; role: string | null } | null = null;
  try {
    const session = await auth.api.getSession({ headers: h });
    if (session) {
      let storeId: string | null = null;
      if (session.user.role !== "SUPERADMIN") storeId = await getStoreId().catch(() => null);
      actor = { userId: session.user.id, storeId, role: session.user.role ?? null };
    }
  } catch { /* report without a user */ }

  // never trust the client's idea of a page to contain anything but a path
  const rawPath = typeof data?.path === "string" ? data.path : "";
  const path = rawPath.startsWith("/") ? rawPath.split("?")[0].slice(0, 300) : null;
  await recordError({
    source: data?.kind === "fetch5xx" ? "API" : "CLIENT",
    message,
    stack: typeof data?.stack === "string" ? data.stack : null,
    path,
    method: typeof data?.method === "string" ? data.method.slice(0, 10) : null,
    userAgent: h.get("user-agent"),
    actor,
  }).catch(() => null);
  return new NextResponse(null, { status: 204 });
}
