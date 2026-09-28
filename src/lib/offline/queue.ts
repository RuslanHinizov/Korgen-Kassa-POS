/**
 * Offline write queue for the kassa.
 *
 * A sale that cannot reach the server is stored here (IndexedDB) and uploaded later, in the order it was made.
 * Each sale carries a `clientSaleId` made on the till, so uploading the same sale twice — a lost response, a
 * flaky connection, two tabs — can never create a second one (the server answers with the sale it already has).
 */

import { idbDelete, idbGetAll, idbPut, idbUpdate } from "./idb";

export type QueueKind = "sale" | "refund" | "return" | "shift-open" | "shift-close" | "cash";

export interface QueueItem {
  id: string;
  kind: QueueKind;
  endpoint: string;
  payload: unknown;
  createdAt: number;
  tries: number;
  lastError?: string;
  /** The server refused this write for good (validation, permission). Kept for a human to look at. */
  failed?: boolean;
}

export interface OfflineStatus {
  online: boolean;
  /** writes waiting to be uploaded */
  pending: number;
  /** writes the server refused; they stay in the queue until someone deals with them */
  failed: number;
  syncing: boolean;
  lastSyncAt: number | null;
  /** The server refused the upload because nobody is signed in: the cashier must sign in again for it to go through. */
  needsLogin: boolean;
  /** An upload's own timestamp was outside the trusted window (clock wrong, or offline too long) — the server
   * recorded it with its own "now" instead. Sticky until dismissed; see UnsyncedBanner. */
  timeAdjusted: boolean;
}

// ── status store (useSyncExternalStore-compatible) ────────────────────────────────────────────────────────────

let status: OfflineStatus = {
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  pending: 0,
  failed: 0,
  syncing: false,
  lastSyncAt: null,
  needsLogin: false,
  timeAdjusted: false,
};
const listeners = new Set<() => void>();

function setStatus(patch: Partial<OfflineStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((fn) => fn());
}

export function getOfflineStatus(): OfflineStatus {
  return status;
}

export function subscribeOfflineStatus(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * A real answer from our API is JSON. A redirect (to the sign-in page) or an HTML page means the request never reached the API —
 * the session is gone — and must never be taken for success, or the write would be thrown away.
 */
export function isApiAnswer(res: Response): boolean {
  return !res.redirected && (res.headers.get("content-type") ?? "").includes("json");
}

export function setNeedsLogin(needsLogin: boolean) {
  if (status.needsLogin !== needsLogin) setStatus({ needsLogin });
}

export function clearTimeAdjusted() {
  if (status.timeAdjusted) setStatus({ timeAdjusted: false });
}

export function setOnline(online: boolean) {
  if (status.online !== online) setStatus({ online });
}

// ── ids and receipt numbers ───────────────────────────────────────────────────────────────────────────────────

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

/** A short code that tells this till apart from the others, kept in the browser (e.g. "A1F3"). */
export function deviceCode(): string {
  const KEY = "korgen-device-code";
  try {
    const existing = localStorage.getItem(KEY);
    if (existing) return existing;
    const made = Math.random().toString(16).slice(2, 6).toUpperCase().padEnd(4, "0");
    localStorage.setItem(KEY, made);
    return made;
  } catch {
    return "T000";
  }
}

/** Receipt number for a sale rung up without a connection: "<till code>-<counter>", e.g. "A1F3-000123". */
export async function nextReceiptNo(): Promise<string> {
  const row = await idbUpdate<{ key: string; value: number }>("meta", "receiptCounter", (cur) => ({ key: "receiptCounter", value: (cur?.value ?? 0) + 1 }));
  const n = row?.value ?? Math.floor(Date.now() / 1000) % 1_000_000;
  return `${deviceCode()}-${String(n).padStart(6, "0")}`;
}

// ── queue ─────────────────────────────────────────────────────────────────────────────────────────────────────

export async function enqueue(kind: QueueKind, endpoint: string, payload: unknown, id: string): Promise<boolean> {
  const item: QueueItem = { id, kind, endpoint, payload, createdAt: Date.now(), tries: 0 };
  const ok = await idbPut("queue", item);
  await refreshCounts();
  return ok;
}

export async function listQueue(): Promise<QueueItem[]> {
  return (await idbGetAll<QueueItem>("queue")).sort((a, b) => a.createdAt - b.createdAt);
}

export async function refreshCounts(): Promise<void> {
  const items = await idbGetAll<QueueItem>("queue");
  const failed = items.filter((i) => i.failed).length;
  setStatus({ pending: items.length - failed, failed });
}

/** Give refused writes another chance (e.g. after an administrator fixed the cause). */
export async function retryFailed(): Promise<void> {
  const items = await idbGetAll<QueueItem>("queue");
  for (const i of items) if (i.failed) await idbPut("queue", { ...i, failed: false });
  await refreshCounts();
  void flushQueue();
}

function withTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  return fetch(url, { ...init, signal: ctl.signal }).finally(() => clearTimeout(timer));
}

let flushing: Promise<void> | null = null;

/** Upload everything waiting, oldest first. Safe to call from several places at once (single flight). */
export function flushQueue(): Promise<void> {
  if (flushing) return flushing;
  flushing = doFlush().finally(() => {
    flushing = null;
  });
  return flushing;
}

async function doFlush(): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    await refreshCounts();
    return;
  }
  const items = (await listQueue()).filter((i) => !i.failed);
  if (items.length === 0) {
    await refreshCounts();
    return;
  }
  setStatus({ syncing: true });
  try {
    for (const item of items) {
      let res: Response;
      try {
        res = await withTimeout(item.endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item.payload) }, 20_000);
      } catch {
        // No connection: stop here so the order is kept, try again later.
        setOnline(false);
        break;
      }
      setOnline(true);
      if (!isApiAnswer(res)) {
        // sent to the sign-in page instead of the API: keep the write, the cashier has to sign in again
        setStatus({ needsLogin: true });
        await idbPut("queue", { ...item, tries: item.tries + 1, lastError: "no session" });
        break;
      }
      if (res.ok) {
        // 200 (already had it) and 201 (created) are both success.
        let timeAdjusted = false;
        try {
          timeAdjusted = !!(await res.json())?.timeAdjusted;
        } catch {
          /* body not read-able as JSON — nothing to warn about */
        }
        await idbDelete("queue", item.id);
        setStatus({ needsLogin: false, ...(timeAdjusted ? { timeAdjusted: true } : {}) });
        continue;
      }
      if (res.status === 401) setStatus({ needsLogin: true });
      if (res.status === 401 || res.status === 408 || res.status === 429 || res.status >= 500) {
        // Not the sale's fault (session expired, server busy): keep it and retry later.
        await idbPut("queue", { ...item, tries: item.tries + 1, lastError: `HTTP ${res.status}` });
        break;
      }
      let message = `HTTP ${res.status}`;
      try {
        const body = await res.json();
        if (typeof body?.error === "string") message = body.error;
        else if (body?.error) message = JSON.stringify(body.error).slice(0, 300);
      } catch {
        /* keep the status text */
      }
      await idbPut("queue", { ...item, failed: true, tries: item.tries + 1, lastError: message });
    }
  } finally {
    await refreshCounts();
    setStatus({ syncing: false, lastSyncAt: Date.now() });
  }
}
