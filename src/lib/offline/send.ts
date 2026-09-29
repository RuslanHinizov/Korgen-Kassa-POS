/**
 * Send a write to the server; when there is no connection, keep it on the till and upload it later.
 *
 * Every write carries an id made on the till, so a retry — a lost answer, a flaky connection, two tabs — can never
 * create it twice (the server answers with what it already has). Order is kept: the upload queue goes oldest first.
 */

import { enqueue, isApiAnswer, setNeedsLogin, setOnline, type QueueKind } from "./queue";
import { deviceAuthHeaders } from "./device-token";

export type SendResult =
  | { ok: true; queued: false; status: number; data: Record<string, unknown> }
  | { ok: true; queued: true; payload: Record<string, unknown> }
  | { ok: false; error: string; status: number; data?: Record<string, unknown> };

const SEND_TIMEOUT_MS = 15_000;

function errorText(error: unknown, fallback: string): string {
  if (typeof error === "string" && error) return error;
  return fallback;
}

export async function sendOrQueue(opts: {
  kind: QueueKind;
  endpoint: string;
  payload: Record<string, unknown>;
  /** the id made on the till for this write (also the queue key) */
  clientId: string;
  fallbackError: string;
  /** Add data only known when the write goes to the queue (e.g. the receipt number the till makes). */
  decorateForQueue?: (payload: Record<string, unknown>) => Promise<Record<string, unknown>>;
}): Promise<SendResult> {
  const online = typeof navigator === "undefined" ? true : navigator.onLine;
  if (online) {
    const deviceHeaders = await deviceAuthHeaders();
    const deviceKey = Boolean(deviceHeaders.Authorization);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), SEND_TIMEOUT_MS);
    let sessionGone = false;
    try {
      const res = await fetch(opts.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...deviceHeaders },
        body: JSON.stringify(opts.payload),
        signal: ctl.signal,
      });
      clearTimeout(timer);
      // sent to the sign-in page instead of the API: nobody is signed in any more
      if (!isApiAnswer(res)) sessionGone = true;
      // The till program's key was refused (package revoked or replaced): the sale is still real — keep it on the till,
      // tell the cashier (needsLogin banner asks for a new package), never turn the customer away.
      if (isApiAnswer(res) && res.status === 401 && deviceKey) sessionGone = true;
      // 502/503/504: the server (or the proxy in front of it) is down or restarting — same as no connection.
      else if (isApiAnswer(res) && (res.status < 502 || res.status > 504)) {
        setOnline(true);
        setNeedsLogin(false);
        const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (res.ok) return { ok: true, queued: false, status: res.status, data };
        return { ok: false, error: errorText(data?.error, opts.fallbackError), status: res.status, data };
      }
    } catch {
      clearTimeout(timer);
      // network error or timeout: fall through and keep the write on the till
    }
    // Keep the write on the till either way; what the cashier is told differs.
    if (sessionGone) setNeedsLogin(true);
    else setOnline(false);
  }

  const payload = opts.decorateForQueue ? await opts.decorateForQueue(opts.payload) : opts.payload;
  const stored = await enqueue(opts.kind, opts.endpoint, payload, opts.clientId);
  if (!stored) {
    return { ok: false, error: "Нет связи с сервером, а память кассы недоступна — операцию нельзя сохранить. Проверьте интернет.", status: 0 };
  }
  return { ok: true, queued: true, payload };
}
