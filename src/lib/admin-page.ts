import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getStoreId } from "@/lib/store-context";

/** Server guard for Управление pages: sends anyone below the required role back to the kassa. */
export async function requireRole(roles: string[] = ["ADMIN", "MANAGER"]) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !roles.includes(session.user.role ?? "")) redirect(`/store/${await getStoreId()}/pos`);
  return session;
}

export async function redirectTo(path: string): Promise<never> {
  redirect(`/store/${await getStoreId()}${path}`);
}
