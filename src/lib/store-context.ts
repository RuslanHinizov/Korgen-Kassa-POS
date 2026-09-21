import { cookies } from "next/headers";
import { STORE_COOKIE, DEFAULT_STORE_ID } from "@/lib/store-constants";

/** The current store id for this request, as set by middleware from the /store/:id URL prefix. */
export async function getStoreId(): Promise<string> {
  const jar = await cookies();
  return jar.get(STORE_COOKIE)?.value || DEFAULT_STORE_ID;
}
