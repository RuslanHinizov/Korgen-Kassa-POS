/**
 * The cashier's shift, kept on the till so it can be opened, used and closed with no connection.
 *
 * The till invents the shift's id, so sales and cash movements can name it before the server has ever heard of it;
 * the uploads then arrive in order (open → sales/movements → close) and the server accepts each exactly once.
 */

import { idbDelete, idbGet, idbPut } from "./idb";
import { listQueue, newId } from "./queue";
import { sendOrQueue } from "./send";
import { getTillAuth } from "./auth";
import { deviceAuthHeaders } from "./device-token";

export interface LocalShift {
  key: "shift";
  id: string;
  openedAt: string;
  openingFloat: number;
  status: "OPEN" | "CLOSED";
}

export interface ShiftInfo {
  id: string;
  openedAt: string;
  openingFloat: number;
}

export async function getLocalShift(): Promise<LocalShift | undefined> {
  return idbGet<LocalShift>("meta", "shift");
}

async function saveShift(shift: LocalShift | null) {
  if (shift) await idbPut("meta", shift);
  else await idbDelete("meta", "shift");
}

/** The shift that is open right now: the server's answer when reachable, otherwise this till's own record. */
export async function loadCurrentShift(): Promise<{ shift: ShiftInfo | null; offline: boolean }> {
  const local = await getLocalShift();
  // closed on this till, the close is still waiting to be uploaded: the server still shows it open, this till does not
  if (local?.status === "CLOSED" && (await listQueue()).some((i) => i.kind === "shift-close" && i.endpoint.endsWith(`/${local.id}`))) {
    return { shift: null, offline: false };
  }
  try {
    // the offline till program (/till) has no session cookie: it asks with its device token and says who is working
    const headers = await deviceAuthHeaders();
    const who = headers.Authorization ? (await getTillAuth())?.userId : undefined;
    const res = await fetch(`/api/shifts?scope=current${who ? `&cashierUserId=${encodeURIComponent(who)}` : ""}`, { cache: "no-store", headers });
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { shift?: { id: string; openedAt: string; openingFloat: string | number } | null };
    if (data.shift) {
      const info: ShiftInfo = { id: data.shift.id, openedAt: data.shift.openedAt, openingFloat: Number(data.shift.openingFloat) };
      await saveShift({ key: "shift", ...info, status: "OPEN" });
      return { shift: info, offline: false };
    }
    // The server knows no open shift. If this till opened one that has not been uploaded yet, that one is real.
    if (local?.status === "OPEN") {
      const waiting = (await listQueue()).some((i) => i.kind === "shift-open" && i.id === local.id);
      if (waiting) return { shift: { id: local.id, openedAt: local.openedAt, openingFloat: local.openingFloat }, offline: false };
    }
    await saveShift(null);
    return { shift: null, offline: false };
  } catch {
    if (local?.status === "OPEN") return { shift: { id: local.id, openedAt: local.openedAt, openingFloat: local.openingFloat }, offline: true };
    return { shift: null, offline: true };
  }
}

export async function openShiftOfflineAware(openingFloat: number, fallbackError: string): Promise<{ ok: true; queued: boolean } | { ok: false; error: string }> {
  const id = newId();
  const openedAt = new Date().toISOString();
  const auth = await getTillAuth();
  const sent = await sendOrQueue({
    kind: "shift-open",
    endpoint: "/api/shifts",
    payload: { id, openingFloat, openedAt, ...(auth ? { cashierUserId: auth.userId } : {}) },
    clientId: id,
    fallbackError,
  });
  // The server already has this cashier's shift open (opened elsewhere, or this till never saw it): carry on with that one.
  if (!sent.ok && sent.status === 409 && sent.data?.shift) {
    const open = sent.data.shift as { id: string; openedAt: string; openingFloat: string | number };
    await saveShift({ key: "shift", id: open.id, openedAt: open.openedAt, openingFloat: Number(open.openingFloat), status: "OPEN" });
    return { ok: true, queued: false };
  }
  if (!sent.ok) return sent;
  const server = sent.queued ? undefined : (sent.data.shift as { id: string; openedAt: string; openingFloat: string | number } | undefined);
  await saveShift({ key: "shift", id: server?.id ?? id, openedAt: server?.openedAt ?? openedAt, openingFloat: Number(server?.openingFloat ?? openingFloat), status: "OPEN" });
  return { ok: true, queued: sent.queued };
}

export type CloseShiftResult = { ok: true; queued: false; report: unknown } | { ok: true; queued: true } | { ok: false; error: string };

export async function closeShiftOfflineAware(shiftId: string, countedCash: number, notes: string | undefined, fallbackError: string): Promise<CloseShiftResult> {
  const closeId = newId();
  const sent = await sendOrQueue({
    kind: "shift-close",
    endpoint: `/api/shifts/${shiftId}`,
    payload: { action: "close", countedCash, notes, closedAt: new Date().toISOString(), offline: true },
    clientId: closeId,
    fallbackError,
  });
  if (!sent.ok) return sent;
  const local = await getLocalShift();
  if (local && local.id === shiftId) await saveShift({ ...local, status: "CLOSED" });
  if (sent.queued) return { ok: true, queued: true };
  return { ok: true, queued: false, report: sent.data.report };
}

export async function cashMovementOfflineAware(input: { type: "DEPOSIT" | "EXPENSE" | "DIVIDEND"; amount: number; reason?: string }, fallbackError: string): Promise<{ ok: true; queued: boolean } | { ok: false; error: string }> {
  const id = newId();
  const shift = await getLocalShift();
  const auth = await getTillAuth();
  const sent = await sendOrQueue({
    kind: "cash",
    endpoint: "/api/cash-movements",
    payload: {
      id,
      ...input,
      createdAt: new Date().toISOString(),
      ...(shift && shift.status === "OPEN" ? { shiftId: shift.id } : {}),
      ...(auth ? { cashierUserId: auth.userId } : {}),
    },
    clientId: id,
    fallbackError,
  });
  if (!sent.ok) return sent;
  return { ok: true, queued: sent.queued };
}
