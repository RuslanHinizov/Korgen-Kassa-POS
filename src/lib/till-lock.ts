/**
 * ЗАБЛОКИРОВАТЬ КАССУ (Доп. функции) must survive a page reload or the cashier simply navigating back
 * to /pos — otherwise the "lock" is worthless (found live 2026-09-28: a reload silently dropped it,
 * landing straight on the sale screen with no PIN prompt at all). Persisted in localStorage so it
 * outlives React state and even a full browser/tab restart, matching a real till's expectation that a
 * lock stays a lock until someone actually enters the manager PIN.
 */
const KEY = "korgen-till-locked";

export function isTillLocked(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setTillLocked(locked: boolean): void {
  try {
    if (locked) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    /* private window / blocked storage: the lock just won't persist, nothing else to do */
  }
}
