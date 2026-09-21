import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { verifyPin } from "@/lib/pin";
import { issueManagerToken, MANAGER_COOKIE } from "@/lib/manager-token";
import { logAudit } from "@/lib/audit";
import { resolvePosActor } from "@/lib/pos-actor";

export const dynamic = "force-dynamic";

const schema = z.object({ pin: z.string().min(1), context: z.string().max(60).optional() });

function authorized(userId: string, via: string) {
  const res = NextResponse.json({ ok: true, via });
  res.cookies.set(MANAGER_COOKIE, issueManagerToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 120,
  });
  return res;
}

export async function POST(req: NextRequest) {
  const actor = await resolvePosActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (["ADMIN", "MANAGER"].includes(actor.role ?? "")) {
    return authorized(actor.userId, "role");
  }

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const storeId = await getStoreId();
  const settings = await prisma.businessSettings.findUnique({
    where: { storeId },
    select: { managerPin: true },
  });
  if (!settings?.managerPin) {
    return NextResponse.json({ error: "no_pin_configured" }, { status: 409 });
  }

  if (!verifyPin(parsed.data.pin, settings.managerPin)) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  await logAudit({
    userId: actor.userId,
    action: "MANAGER_OVERRIDE",
    entityType: "ManagerPin",
    details: { context: parsed.data.context },
  });

  return authorized(actor.userId, "pin");
}
