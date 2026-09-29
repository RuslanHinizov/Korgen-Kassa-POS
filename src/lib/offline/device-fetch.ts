/**
 * On the offline till (/till) there is no session cookie. This puts the device token and the working employee on every
 * same-origin `/api/` call, so the server (src/lib/device-access.ts) sees an ordinary cashier session. Installed once,
 * at module load, before any screen fetches.
 */

import { idbGet } from "./idb";

const SKIP = ["/api/auth", "/api/login", "/api/setup"];
let creds: { token?: string; cashier?: string; at: number } | null = null;

async function currentCreds() {
  if (creds && Date.now() - creds.at < 1500) return creds;
  const [dev, auth] = await Promise.all([idbGet<{ token: string }>("meta", "deviceToken"), idbGet<{ userId: string }>("meta", "tillAuth")]);
  creds = { token: dev?.token, cashier: auth?.userId, at: Date.now() };
  return creds;
}

export function installDeviceFetch(): void {
  if (typeof window === "undefined" || !location.pathname.startsWith("/till")) return;
  const w = window as typeof window & { __deviceFetch?: boolean };
  if (w.__deviceFetch) return;
  w.__deviceFetch = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      if (url.origin === location.origin && url.pathname.startsWith("/api/") && !SKIP.some((p) => url.pathname.startsWith(p))) {
        const c = await currentCreds();
        if (c.token && c.cashier) {
          const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
          if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${c.token}`);
          headers.set("X-Till-Cashier", c.cashier);
          init = { ...init, headers };
        }
      }
    } catch {
      /* never block a request because the extra headers could not be added */
    }
    return original(input, init);
  };
}
