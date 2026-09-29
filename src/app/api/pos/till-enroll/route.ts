import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createHubToken, resolveHubActor } from "@/lib/hub-auth";

export const dynamic = "force-dynamic";

const schema = z.object({ code: z.string().regex(/^[A-Za-z0-9]{1,12}$/) });

/**
 * POST /api/pos/till-enroll { code } — a till program swaps the key it got inside the market package for a key of its own.
 * Nobody has to do anything: the till calls this by itself the first time it is online. From then on the package file
 * (and the flash drive it travelled on) is no longer a way in — it can be revoked without touching any working till,
 * and one lost till is cut off by revoking only its own key. Enrolling again with the same code replaces that till's key.
 */
export async function POST(req: NextRequest) {
  const hub = await resolveHubActor(req);
  if (!hub) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const label = `Касса ${parsed.data.code.toUpperCase()}`;
  await prisma.hubToken.updateMany({ where: { storeId: hub.storeId, label, revokedAt: null }, data: { revokedAt: new Date() } });
  const token = await createHubToken(hub.storeId, label);
  return NextResponse.json({ token });
}
