import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getStoreId } from "@/lib/store-context";
import { getActivePromotions } from "@/lib/till-data";

// GET /api/promotions/active — active promotions serialised for the POS engine.
// (Time-window filtering happens client- and server-side via isPromotionLive.)
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const storeId = await getStoreId();

  const promotions = await getActivePromotions(storeId);

  return NextResponse.json({ promotions });
}
