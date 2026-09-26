"use client";

import { useEffect } from "react";
import { flushQueue, refreshCounts, setOnline } from "@/lib/offline/queue";
import { syncCatalog } from "@/lib/offline/catalog";
import { getTillAuth, setTillAuth, tillAuthValid } from "@/lib/offline/auth";
import { bindTillToStore } from "@/lib/offline/clear";

const PING_EVERY_MS = 15_000;
const FLUSH_EVERY_MS = 30_000;
const CATALOG_EVERY_MS = 5 * 60_000;
const WARM_LOGIN_KEY = "korgen-login-page-warmed";

/** `navigator.onLine` only says a network card is connected. This asks the server itself. */
async function serverReachable(): Promise<boolean> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 5000);
  try {
    const res = await fetch("/api/ping", { cache: "no-store", signal: ctl.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Load the cashier sign-in page once in a hidden frame, so the service worker keeps a copy: after the end of a shift
 * (or when the session is gone) the cashier must be able to reach the sign-in page even without a connection.
 */
function warmLoginPage() {
  try {
    if (localStorage.getItem(WARM_LOGIN_KEY) === new Date().toDateString()) return;
    const frame = document.createElement("iframe");
    frame.src = "/kasa-giris";
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    frame.style.cssText = "position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none";
    frame.onload = () => setTimeout(() => frame.remove(), 3000);
    document.body.appendChild(frame);
    localStorage.setItem(WARM_LOGIN_KEY, new Date().toDateString());
  } catch {
    /* only an optimisation */
  }
}

interface Props {
  cashierId: string;
  cashierName: string;
  cashierRole: string;
  storeId: string;
}

/**
 * Mounted once on the kassa screen. Keeps the connection state true, uploads what was made without a connection,
 * keeps the till's copy of the catalogue up to date, remembers who is working here, and — with no connection and no
 * valid record of a cashier — sends the person to the sign-in page (which then signs in offline). Renders nothing.
 */
export function OfflineManager({ cashierId, cashierName, cashierRole, storeId }: Props) {
  useEffect(() => {
    let stopped = false;
    let confirmedSession = false;

    async function check() {
      const reachable = typeof navigator !== "undefined" && navigator.onLine ? await serverReachable() : false;
      if (stopped) return;
      setOnline(reachable);

      if (reachable) {
        // A page from the cache may show a previous cashier — the server-rendered identity counts only if this page came
        // from the server, which is the case when the session it belongs to is confirmed just now.
        if (!confirmedSession && cashierId) {
          try {
            const res = await fetch("/api/auth/get-session", { cache: "no-store" });
            const session = res.ok ? ((await res.json()) as { user?: { id: string; name: string; role: string } } | null) : null;
            if (session?.user) {
              confirmedSession = true;
              await bindTillToStore(storeId);
              await setTillAuth({ userId: session.user.id, name: session.user.name, role: session.user.role ?? cashierRole, storeId, at: Date.now(), mode: "online" });
            }
          } catch {
            /* try again on the next round */
          }
        } else if (confirmedSession) {
          const current = await getTillAuth();
          if (current && current.mode === "online") await setTillAuth({ ...current, at: Date.now() });
        }
        void flushQueue();
        warmLoginPage();
        return;
      }

      // No connection: without a valid record of who is working here, only the offline sign-in can let someone in.
      const auth = await getTillAuth();
      if (!tillAuthValid(auth) && !window.location.pathname.startsWith("/kasa-giris")) {
        window.location.href = "/kasa-giris";
      }
    }

    const onOnline = () => {
      void check();
      void syncCatalog();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    void refreshCounts();
    void check();
    void syncCatalog();

    const ping = setInterval(() => void check(), PING_EVERY_MS);
    const flush = setInterval(() => void flushQueue(), FLUSH_EVERY_MS);
    const catalog = setInterval(() => void syncCatalog(), CATALOG_EVERY_MS);

    return () => {
      stopped = true;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      clearInterval(ping);
      clearInterval(flush);
      clearInterval(catalog);
    };
  }, [cashierId, cashierRole, storeId]);

  // cashierName is kept in the props for callers/tests; the till record is written from the confirmed session
  void cashierName;
  return null;
}
