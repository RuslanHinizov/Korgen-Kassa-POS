/**
 * The till program's own key to the cloud (plan §12, stage A3b). A till that starts with no server session (the
 * offline program) cannot upload with a cookie, so the market package carries a per-package device token (a store-scoped
 * `hub_...` Bearer token, src/lib/hub-auth.ts). It is used only on the offline till (/till); the browser cash register
 * (/pos) keeps using the cashier's own session.
 */

import { idbDelete, idbGet, idbPut } from "./idb";
import { deviceCode } from "./queue";

const KEY = "deviceToken";

export async function setDeviceToken(token: string | undefined, enrolled = false): Promise<void> {
  if (token) await idbPut("meta", { key: KEY, token, enrolled });
  else await idbDelete("meta", KEY);
}

let lastEnroll = 0;
/**
 * The key inside a market package is only a way to get started. The first time the till is online it trades it for a key
 * of its own (this till only), automatically — see /api/pos/till-enroll. Best effort; retried later if it fails.
 */
export async function enrollDevice(): Promise<void> {
  if (typeof location === "undefined" || !location.pathname.startsWith("/till")) return;
  if (Date.now() - lastEnroll < 60_000) return;
  const row = await idbGet<{ token: string; enrolled?: boolean }>("meta", KEY);
  if (!row?.token || row.enrolled) return;
  lastEnroll = Date.now();
  try {
    const res = await fetch("/api/pos/till-enroll", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${row.token}` }, body: JSON.stringify({ code: deviceCode() }) });
    if (!res.ok) return;
    const data = (await res.json()) as { token?: string };
    if (data.token) await setDeviceToken(data.token, true);
  } catch {
    /* offline or busy: try again next time */
  }
}

/** `Authorization` header for uploads from the offline till; empty anywhere else or when no token was loaded. */
export async function deviceAuthHeaders(): Promise<Record<string, string>> {
  if (typeof location === "undefined" || !location.pathname.startsWith("/till")) return {};
  const row = await idbGet<{ token: string }>("meta", KEY);
  return row?.token ? { Authorization: `Bearer ${row.token}` } : {};
}
