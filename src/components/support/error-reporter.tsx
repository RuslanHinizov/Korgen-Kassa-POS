"use client";

import { useEffect } from "react";

// The browser's own fetch, captured before we wrap it — reports must never go through the wrapper
// (that would loop when the reporting request itself fails).
let nativeFetch: typeof fetch | null = null;
const sent = new Set<string>();
let budget = 10; // reports per page load

export function reportClientError(error: unknown, extra?: { kind?: string; method?: string; note?: string }) {
  try {
    if (typeof window === "undefined" || budget <= 0) return;
    const err = error as { message?: string; stack?: string } | string | undefined;
    const message = (typeof err === "string" ? err : err?.message) || "Unknown error";
    if (/^NEXT_(REDIRECT|NOT_FOUND)|NEXT_HTTP_ERROR_FALLBACK/.test(message)) return; // Next.js navigation signals
    const stack = typeof err === "string" ? undefined : err?.stack;
    const key = `${extra?.kind ?? ""}|${message}|${(stack ?? "").split("\n")[1] ?? ""}`;
    if (sent.has(key)) return;
    sent.add(key);
    budget -= 1;
    const body = JSON.stringify({
      message: extra?.note ? `${message} — ${extra.note}` : message,
      stack, kind: extra?.kind ?? "window", method: extra?.method,
      path: window.location.pathname,
    });
    (nativeFetch ?? fetch)("/api/errors", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
  } catch { /* never throw from the reporter */ }
}

/** Mounted once in the root layout: catches uncaught errors, rejected promises and failing (5xx) API calls. */
export function ErrorReporter() {
  useEffect(() => {
    nativeFetch = window.fetch.bind(window);
    const native = nativeFetch;

    const onError = (e: ErrorEvent) => {
      // cross-origin / extension noise arrives without details
      if (!e.error && (!e.message || e.message === "Script error.")) return;
      reportClientError(e.error ?? e.message);
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason;
      if (r instanceof Error) reportClientError(r, { kind: "promise" });
      else if (typeof r === "string") reportClientError(r, { kind: "promise" });
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    // API calls that answer 5xx are bugs on our side even when the page copes with them
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const res = await native(...args);
      try {
        if (res.status >= 500) {
          const input = args[0];
          const raw = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
          const url = new URL(raw, window.location.href);
          if (url.origin === window.location.origin && !url.pathname.startsWith("/api/errors")) {
            const method = (args[1]?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
            res.clone().text().then((t) => {
              reportClientError(`HTTP ${res.status} ${method} ${url.pathname}`, { kind: "fetch5xx", method, note: t.replace(/\s+/g, " ").slice(0, 160) });
            }).catch(() => {});
          }
        }
      } catch { /* ignore */ }
      return res;
    };

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      window.fetch = native;
    };
  }, []);
  return null;
}
