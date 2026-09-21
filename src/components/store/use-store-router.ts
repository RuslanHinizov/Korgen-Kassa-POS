"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { useStorePath } from "./store-provider";

/** Drop-in replacement for next/navigation's useRouter(): push/replace take an app-relative path. */
export function useStoreRouter() {
  const router = useRouter();
  const storePath = useStorePath();
  return useMemo(() => ({
    push: (path: string) => router.push(storePath(path)),
    replace: (path: string) => router.replace(storePath(path)),
    back: () => router.back(),
    refresh: () => router.refresh(),
  }), [router, storePath]);
}
