import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { readFile } from "fs/promises";
import { uploadDir } from "@/lib/storage";

const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif",
};

// GET /uploads/:name — files saved by the "local" storage provider (logos, product and consultant photos).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const type = TYPES[path.extname(name).toLowerCase()];
  if (!type || !/^[\w.-]+$/.test(name) || name.includes("..")) return new NextResponse("Not found", { status: 404 });
  try {
    // Files uploaded before the persistent volume existed still live in public/uploads.
    const file = await readFile(path.join(uploadDir(), name)).catch(() => readFile(path.join(process.cwd(), "public", "uploads", name)));
    return new NextResponse(file, { headers: { "Content-Type": type, "Cache-Control": "public, max-age=31536000, immutable" } });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
