import { NextRequest, NextResponse } from "next/server";

// GET /api/setup/resume?next=/path — for a browser without the "setup complete" cookie.
// If the system is already installed, remember that (cookie) and go straight back to the page;
// otherwise show the first-run wizard.
export async function GET(req: NextRequest) {
  const next = req.nextUrl.searchParams.get("next") ?? "/";
  // only same-site paths; never "//host" or "/\host"
  const back = next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";

  let complete = false;
  try {
    const { isInstalled } = await import("@/lib/installed");
    complete = await isInstalled();
  } catch {
    // database not reachable / not initialised yet
  }

  const res = new NextResponse(null, { status: 307, headers: { Location: complete ? back : "/setup" } });
  if (complete) {
    res.cookies.set("olgax-setup-complete", "1", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      secure: (process.env.BETTER_AUTH_URL ?? "").startsWith("https://"),
    });
  }
  return res;
}
