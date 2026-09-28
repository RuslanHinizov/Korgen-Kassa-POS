import { NextRequest, NextResponse } from "next/server";
import { resolvePosActor, type PosActor } from "./pos-actor";
import { getStoreId } from "./store-context";
import { resolveHubActor } from "./hub-auth";

export interface PosRequestContext {
  storeId: string;
  actor: PosActor;
  /** true when this request came from a local Hub (Bearer token), not a cashier's own session. */
  viaHub: boolean;
}

/**
 * Every POS write (sale, refund, shift, cash movement, return) accepts either:
 *   - a normal cashier/office session (cookie) — storeId from the resolved store, actor is that person, or
 *   - a local Hub's Bearer token (src/lib/hub-auth.ts) — storeId from the token; actor.userId is `""`, which
 *     `attributedUserId` (offline-write.ts) treats as "no fallback" — the real cashier must be named explicitly
 *     in the body's `cashierUserId`, since a Hub has no session of its own to fall back to.
 * Returns `{ error }` (already-built 401 response) when neither authenticates.
 */
export async function resolvePosRequest(req: NextRequest): Promise<PosRequestContext | { error: NextResponse }> {
  const hub = await resolveHubActor(req);
  if (hub) return { storeId: hub.storeId, actor: { userId: "", role: "HUB" }, viaHub: true };

  const actor = await resolvePosActor();
  if (!actor) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  return { storeId: await getStoreId(), actor, viaHub: false };
}

export function isPosRequestError(ctx: PosRequestContext | { error: NextResponse }): ctx is { error: NextResponse } {
  return "error" in ctx;
}
