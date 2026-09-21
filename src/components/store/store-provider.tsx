"use client";

import { createContext, useContext, type ReactNode } from "react";
import { usePathname } from "next/navigation";

const StoreIdContext = createContext<string | null>(null);

export function StoreProvider({ storeId, children }: { storeId: string; children: ReactNode }) {
  return <StoreIdContext.Provider value={storeId}>{children}</StoreIdContext.Provider>;
}

/** The current store id, supplied server-side by the root layout from the /store/:id URL. */
export function useStoreId(): string {
  const storeId = useContext(StoreIdContext);
  if (!storeId) throw new Error("useStoreId() must be used within <StoreProvider>");
  return storeId;
}

/** Prefixes an app-relative path (e.g. "/products") with the current store, for Link hrefs and router.push. */
export function useStorePath() {
  const storeId = useStoreId();
  return (path: string) => `/store/${storeId}${path}`;
}

/**
 * usePathname() reflects the pre-rewrite URL (/store/:id/...) since middleware
 * rewrites are transparent to the browser's address bar. Use this instead of
 * next/navigation's usePathname() whenever comparing against an app-relative
 * href (e.g. active-nav-item checks) so the store prefix doesn't break the match.
 */
export function useStrippedPathname(): string {
  const storeId = useStoreId();
  const rawPathname = usePathname();
  return rawPathname.replace(new RegExp(`^/store/${storeId}`), "") || "/";
}
