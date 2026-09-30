import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { STORE_COOKIE, DEFAULT_STORE_ID } from "@/lib/store-constants";
import { DEVICE_OK_HEADER, deviceMayCall } from "@/lib/device-access";

// Middleware runs in Edge runtime.
// Auth cookie presence is checked; full session validation happen in Server Components.

// /api/hub/* carries its own Bearer-token auth (src/lib/hub-auth.ts), never a session cookie — it must
// reach the route handler as-is instead of being redirected to /login like a signed-out browser.
const PUBLIC_PATHS = ["/login", "/kasa-giris", "/api/auth", "/api/login", "/setup", "/api/setup", "/api/ping", "/api/errors", "/api/hub", "/till-updates"];

// Matches "/store/<id>" or "/store/<id>/rest/of/path".
const STORE_PREFIX_RE = /^\/store\/([^/]+)(\/.*)?$/;

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // DEVICE_OK_HEADER is ours alone (set below after the path check): whatever a client sends under that name is dropped.
  const cleanHeaders = new Headers(request.headers);
  cleanHeaders.delete(DEVICE_OK_HEADER);
  const pass = () => NextResponse.next({ request: { headers: cleanHeaders } });

  // Allow Next.js internals & static assets (including all public/ files)
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/manifest") ||
    pathname.startsWith("/icons") ||
    pathname.startsWith("/sw.js") ||
    pathname.startsWith("/uploads") ||
    /\.(?:png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf|eot|webmanifest)$/i.test(pathname)
  ) {
    return pass();
  }

  // Health check for deploy scripts / uptime monitors — no cookie, no redirects.
  if (pathname === "/api/ping" || pathname === "/api/health") return pass();

  // A local Hub authenticates with `Authorization: Bearer hub_...` (src/lib/hub-auth.ts), never a cookie —
  // it must reach the route handler as-is, before the setup-completion gate below (which redirects a
  // cookie-less request through /api/setup/resume; a server-to-server call has no cookie jar to carry that
  // redirect's Set-Cookie forward, so it would just loop). The token itself is verified inside the route.
  if ((request.headers.get("authorization") ?? "").startsWith("Bearer hub_")) {
    // A device token opens only the Hub's own routes and the API the till itself uses; pages are closed to it.
    if (pathname.startsWith("/api/hub")) return pass();
    if (pathname.startsWith("/api/") && deviceMayCall(pathname)) {
      const h = new Headers(cleanHeaders);
      h.set(DEVICE_OK_HEADER, "1");
      return NextResponse.next({ request: { headers: h } });
    }
    // other API paths stay reachable for the Hub's server-to-server calls, but never carry the device flag
    if (pathname.startsWith("/api/")) return pass();
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // The offline till shell is a static page drawn from the till's own IndexedDB: it must open with no cookie,
  // no session and no server round-trip (the setup gate below would redirect through /api/setup/resume).
  if (pathname === "/till" || pathname.startsWith("/till/")) return pass();
  // A brand-new till program has no cookie either: it trades an activation code for its package (rate-limited in the route).
  if (pathname === "/api/till-activate") return pass();
  // The till program looks for a newer version of itself (electron-updater) with no cookie either; the route serves only release files.
  if (pathname.startsWith("/till-updates/")) return pass();

  // Check setup completion via cookie (set by /api/setup/complete)
  const setupDone = request.cookies.get("olgax-setup-complete")?.value === "1";
  const hasDbUrl = !!process.env.DATABASE_URL;
  const hasAuthSecret = !!process.env.BETTER_AUTH_SECRET;

  // If setup IS done and trying to access /setup, redirect to login/pos
  const isSetupPath = pathname.startsWith("/setup") || pathname.startsWith("/api/setup");
  if (setupDone && isSetupPath) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Auth routes must always be accessible (Better Auth sign-in/out/session)
  if (pathname.startsWith("/api/auth")) {
    return pass();
  }

  // If setup NOT done, redirect to setup (unless already there), but allow other API routes if needed?
  // No, strict barrier: if setup incomplete, force setup.
  // Exception: /api/setup/* is needed. 
  if ((!setupDone || !hasDbUrl || !hasAuthSecret) && !isSetupPath) {
    // A device that has never visited (no cookie) but belongs to an already-installed system is sent
    // through /api/setup/resume, which sets the cookie and returns to the page — no wizard flash.
    if (hasDbUrl && hasAuthSecret) {
      const back = encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search);
      return NextResponse.redirect(new URL(`/api/setup/resume?next=${back}`, request.url));
    }
    return NextResponse.redirect(new URL("/setup", request.url));
  }

  // Check auth via Better Auth session cookie – no DB round-trip needed in Edge runtime.
  const hasSession =
    !!request.cookies.get("better-auth.session_token")?.value ||
    !!request.cookies.get("__Secure-better-auth.session_token")?.value;

  const currentStoreId = request.cookies.get(STORE_COOKIE)?.value || DEFAULT_STORE_ID;

  // Allow public paths (both office and dedicated cash-register login).
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return pass();
  }

  // The cash monitor is normally opened with its store in the URL.  Auth pages
  // are public, so they must be rewritten before the session redirect below;
  // otherwise /store/:id/kasa-giris would incorrectly become a 404 (or /login).
  const publicStoreMatch = pathname.match(STORE_PREFIX_RE);
  const publicStoreRest = publicStoreMatch?.[2] ?? "/";
  if (publicStoreMatch && (publicStoreRest === "/kasa-giris" || publicStoreRest === "/login")) {
    const url = request.nextUrl.clone();
    url.pathname = publicStoreRest;
    const res = NextResponse.rewrite(url, { request: { headers: cleanHeaders } });
    res.cookies.set(STORE_COOKIE, publicStoreMatch[1], { path: "/", sameSite: "lax" });
    return res;
  }

  // If not authenticated and trying to access protected route, redirect to login
  if (!hasSession) {
    const kioskMatch = pathname.match(STORE_PREFIX_RE);
    // A cash-monitor bookmark must never send a cashier to the office login.
    if (kioskMatch && (kioskMatch[2] ?? "/") === "/pos") {
      return NextResponse.redirect(new URL(`/store/${kioskMatch[1]}/kasa-giris`, request.url));
    }
    const url = new URL("/login", request.url);
    // Optional: add ?callbackUrl=... if needed, but for POS simple redirect is fine
    return NextResponse.redirect(url);
  }

  // The platform owner's panel lives outside any market (no /store/:id prefix). The page
  // itself verifies the SUPERADMIN role server-side.
  if (pathname === "/superadmin" || pathname.startsWith("/superadmin/")) {
    return pass();
  }

  // API routes are called directly (fetch("/api/...")), never through the
  // /store/:id prefix — they read the store id from the cookie via
  // getStoreId(), already set below whenever the user is on a /store/:id page.
  if (pathname.startsWith("/api")) {
    return pass();
  }

  // Multi-store routing: the browser's address bar always shows /store/:id/...
  // (bookmarkable, matches UMAG). A request that already carries the prefix is
  // rewritten to the underlying (unprefixed) page/route so the existing
  // file-based routes keep serving it unchanged; the store id is captured into
  // a cookie so Server Components and API routes can read it via getStoreId().
  const storeMatch = pathname.match(STORE_PREFIX_RE);
  if (storeMatch) {
    const storeId = storeMatch[1];
    const rest = storeMatch[2] ?? "/";
    const url = request.nextUrl.clone();
    url.pathname = rest;
    const res = NextResponse.rewrite(url, { request: { headers: cleanHeaders } });
    res.cookies.set(STORE_COOKIE, storeId, { path: "/", sameSite: "lax" });
    return res;
  }

  // No store prefix on an app route — redirect to the canonical store-scoped URL.
  const url = request.nextUrl.clone();
  url.pathname = `/store/${currentStoreId}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf|eot|webmanifest)).*)",
  ],
};
