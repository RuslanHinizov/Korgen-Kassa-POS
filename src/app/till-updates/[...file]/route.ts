import { NextResponse } from "next/server";
import { createReadStream, statSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

export const dynamic = "force-dynamic";

/**
 * GET /till-updates/<file> — the update feed of the standalone till program (electron-updater, "generic" provider).
 * No session: the program has none while it is only checking. Only the three kinds of file electron-builder makes for a
 * release are served (latest.yml, the installer, its .blockmap), by bare file name, from the folder TILL_UPDATES_DIR
 * (default /app/till-updates — a mounted folder on the server where the release files are copied, see docs/till-updates.md).
 * The installer itself carries no market data; every market's till still needs its own activation code.
 */
const ALLOWED = /^(latest\.yml|Korgen[ .-]Kassa[ .-]Setup[ .-][0-9A-Za-z.-]+\.exe(\.blockmap)?)$/;

export async function GET(_req: Request, { params }: { params: Promise<{ file: string[] }> }) {
  const parts = (await params).file ?? [];
  const name = parts.length === 1 ? decodeURIComponent(parts[0]) : "";
  if (!ALLOWED.test(name)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const full = path.join(process.env.TILL_UPDATES_DIR ?? "/app/till-updates", name);
  let size: number;
  try {
    const st = statSync(full);
    if (!st.isFile()) throw new Error("not a file");
    size = st.size;
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const isYml = name.endsWith(".yml");
  return new NextResponse(Readable.toWeb(createReadStream(full)) as ReadableStream, {
    headers: {
      "Content-Type": isYml ? "text/yaml; charset=utf-8" : "application/octet-stream",
      "Content-Length": String(size),
      // the small manifest must always be fresh; the installer never changes once published
      "Cache-Control": isYml ? "no-store" : "public, max-age=3600",
    },
  });
}
