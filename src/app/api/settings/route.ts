import { NextResponse } from "next/server";
import { getStoreId } from "@/lib/store-context";
import { getPublicSettings } from "@/lib/till-data";

export async function GET() {
  return NextResponse.json(await getPublicSettings(await getStoreId()));
}
