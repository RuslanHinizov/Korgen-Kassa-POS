// Runs once per server start. `onRequestError` is called by Next.js for every error thrown while
// rendering a page or running an API route — we keep it (grouped) for /superadmin/errors.
export async function register() {}

type RequestInfo = { path: string; method: string; headers: { [key: string]: string | string[] | undefined } };

export async function onRequestError(err: unknown, request: RequestInfo) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { recordError } = await import("@/lib/error-report");
    const { auth } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");

    const error = err as { message?: string; stack?: string; digest?: string };
    const message = error?.message || String(err);
    if (message === "NEXT_REDIRECT" || message === "NEXT_NOT_FOUND") return;

    // who was it? — the session cookie is in the request headers
    const flat = new Headers();
    for (const [k, v] of Object.entries(request.headers)) if (v !== undefined) flat.set(k, Array.isArray(v) ? v.join(", ") : v);
    let actor: { userId: string; storeId: string | null; role: string | null } | null = null;
    try {
      const session = await auth.api.getSession({ headers: flat });
      if (session) {
        let storeId: string | null = null;
        if (session.user.role !== "SUPERADMIN") {
          const cookieStore = /(?:^|;\s*)store-id=([^;]+)/.exec(flat.get("cookie") ?? "")?.[1];
          const rows = await prisma.userStoreAssignment.findMany({ where: { userId: session.user.id }, select: { storeId: true }, orderBy: { createdAt: "asc" } });
          storeId = rows.find((r) => r.storeId === cookieStore)?.storeId ?? rows[0]?.storeId ?? null;
        }
        actor = { userId: session.user.id, storeId, role: session.user.role ?? null };
      }
    } catch { /* unknown user */ }

    await recordError({
      source: request.path.startsWith("/api/") ? "API" : "SERVER",
      message,
      stack: error?.stack ?? null,
      path: request.path,
      method: request.method,
      userAgent: typeof request.headers["user-agent"] === "string" ? request.headers["user-agent"] : null,
      actor,
    });
  } catch {
    // reporting must never make things worse
  }
}
