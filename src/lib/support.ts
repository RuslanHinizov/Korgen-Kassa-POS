import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getStoreId } from "@/lib/store-context";

export const MAX_SUPPORT_BODY = 2000;

/** The signed-in market employee (never the platform owner) and the market they are working in. */
export async function getSupportActor() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || session.user.role === "SUPERADMIN") return null;
  const storeId = await getStoreId();
  return { userId: session.user.id, storeId };
}

/** Keep only a path (no host, no query values that could carry tokens) of where the user was. */
export function cleanPageUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const path = value.split("?")[0].split("#")[0].slice(0, 300);
  return path.startsWith("/") ? path : null;
}
