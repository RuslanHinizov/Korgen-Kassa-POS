/**
 * Korgen Kassa POS — Service Worker
 *
 * Goal: the till keeps opening and selling when the internet is gone.
 *   - Pages (navigations): network first; if the server does not answer, the last copy of that page is used.
 *   - Static files (_next/static, icons, ...): network first, cached copy as fallback.
 *   - A short list of read-only API calls the kassa needs to start (settings, shift, promotions, ...):
 *     network first, cached answer as fallback — so a till that is reloaded offline still knows the tax rate
 *     and its permissions. Everything else under /api/ (all writes, searches, ...) is left alone: the app itself
 *     queues offline writes (src/lib/offline).
 *
 * Caches hold data of ONE market, so the app asks this worker to wipe them when the cashier signs out
 * (message "clear-caches"), see src/lib/offline/clear.ts.
 */

const VERSION = "v2";
const PAGE_CACHE = `korgen-pages-${VERSION}`;
const STATIC_CACHE = `korgen-static-${VERSION}`;
const API_CACHE = `korgen-api-${VERSION}`;
const CURRENT = [PAGE_CACHE, STATIC_CACHE, API_CACHE];

// Read-only calls the kassa screen makes on start-up.
const API_READ_PATHS = [
  /^\/api\/settings$/,
  /^\/api\/promotions\/active$/,
  /^\/api\/shifts$/,
  /^\/api\/consultants$/,
  /^\/api\/quick-products$/,
  /^\/api\/quick-product-groups$/,
  /^\/api\/pos\/(cashbox|cashiers|acting-cashier|reference-books)$/,
];

const STATIC_PATH = /^\/(_next\/static\/|icons\/|.*\.(?:png|jpe?g|svg|ico|webp|woff2?|css|js|json)$)/;

// A page fetched only to end up on a sign-in / set-up screen must not be remembered as the till's page.
const NOT_A_TILL_PAGE = /(giris|login|setup|superadmin)/i;

const NAVIGATION_TIMEOUT_MS = 6000;

// ── Install / activate ──────────────────────────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  // Best effort only: a file that is missing must never stop the worker from installing.
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.add("/manifest.json").catch(() => undefined))
      .catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("korgen-") && !CURRENT.includes(k)).map((k) => caches.delete(k))))
      // the very first release used "korgen-kassa-pos-v1"
      .then(() => caches.delete("korgen-kassa-pos-v1"))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "clear-caches") {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("korgen-")).map((k) => caches.delete(k)))));
  }
});

// ── Helpers ─────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Store a response. IMPORTANT: `copy` must be `res.clone()` taken BEFORE the original is handed to the page —
 * once the page has started reading the body, cloning it is no longer possible.
 *
 * A redirected response cannot be served for a navigation (redirect mode "manual"), so a plain copy is kept.
 */
async function remember(cacheName, request, copy, redirected) {
  try {
    const stored = redirected ? new Response(await copy.blob(), { status: 200, statusText: "OK", headers: copy.headers }) : copy;
    const cache = await caches.open(cacheName);
    await cache.put(request, stored);
  } catch {
    /* storage full or unavailable: the till still works, it just cannot go offline for this page */
  }
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

async function networkFirst(request, cacheName) {
  try {
    const res = await fetch(request);
    if (res.ok) void remember(cacheName, request, res.clone(), false);
    return res;
  } catch (err) {
    const cached = await caches.match(request, { ignoreVary: true });
    if (cached) return cached;
    throw err;
  }
}

/** The stored kassa page of this browser's market, e.g. /store/abc/pos. */
async function findTillPage() {
  const cache = await caches.open(PAGE_CACHE);
  const keys = await cache.keys();
  const key = keys.find((k) => /^\/store\/[^/]+\/pos\/?$/.test(new URL(k.url).pathname));
  return key ? cache.match(key, { ignoreVary: true }) : undefined;
}

async function navigate(request) {
  const url = new URL(request.url);
  const network = fetch(request);
  try {
    // If the server is slow but a copy exists, prefer the copy after a while instead of a blank wait.
    const cachedNow = await caches.match(request, { ignoreVary: true, ignoreSearch: true });
    const res = cachedNow ? await withTimeout(network, NAVIGATION_TIMEOUT_MS) : await network;
    if (res.ok && !(res.redirected && NOT_A_TILL_PAGE.test(new URL(res.url).pathname))) {
      // clones are taken here, before `res` goes to the page
      void remember(PAGE_CACHE, request, res.clone(), res.redirected);
      if (res.redirected) void remember(PAGE_CACHE, new Request(res.url), res.clone(), true);
    }
    return res;
  } catch (err) {
    network.catch(() => undefined); // do not leave an unhandled rejection behind
    const cached =
      (await caches.match(request, { ignoreVary: true, ignoreSearch: true })) ||
      (await caches.match(url.pathname, { ignoreVary: true })) ||
      // "/pos" (the app's start page) redirects to "/store/<id>/pos"; only the final page is stored, so find it
      (url.pathname === "/pos" || url.pathname === "/" ? await findTillPage() : undefined);
    if (cached) return cached;
    throw err;
  }
}

// ── Fetch ───────────────────────────────────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/")) {
    if (API_READ_PATHS.some((re) => re.test(url.pathname))) event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  // Next.js client-side navigations ask for the page's data (RSC) — never mix that with the page HTML.
  if (request.headers.get("RSC") || url.searchParams.has("_rsc")) return;

  if (request.mode === "navigate") {
    event.respondWith(navigate(request));
    return;
  }

  if (STATIC_PATH.test(url.pathname)) {
    event.respondWith(networkFirst(request, STATIC_CACHE));
  }
});
