// Copies the till screens out of a built Korgen Kassa web image into web/ so the program carries them inside.
//   node scripts/sync-web.mjs [container] [serverUrl]
// Static files (_next/static, public/) come from the container; the /till page itself is fetched from the running
// server of the SAME build, so the page and its script files always match.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, "..", "web");
const container =
  process.argv[2] || execFileSync("docker", ["compose", "ps", "-q", "web"], { cwd: join(here, "..", "..") }).toString().trim();
const server = (process.argv[3] || "http://localhost:3000").replace(/\/+$/, "");
if (!container) throw new Error("no running web container");

rmSync(web, { recursive: true, force: true });
mkdirSync(join(web, "_next"), { recursive: true });
execFileSync("docker", ["cp", `${container}:/app/.next/static`, join(web, "_next", "static")]);
execFileSync("docker", ["cp", `${container}:/app/public`, join(web, "public")]);
// the public folder also holds big one-off files that the till never uses
for (const junk of [
  "Склад_export_09.09.2026 19_37.xlsx",
  "Список товаров_export_09.09.2026 19_14.xlsx",
  "WhatsApp Image 2026-09-09 at 15.04.56.jpeg",
  "WhatsApp Image 2026-09-09 at 15.21.40.jpeg",
]) {
  rmSync(join(web, "public", junk), { force: true });
}
// the service worker is not needed inside the program: the screens are already local
rmSync(join(web, "public", "sw.js"), { force: true });

const res = await fetch(`${server}/till`, { redirect: "follow" });
if (!res.ok) throw new Error(`/till answered ${res.status}`);
writeFileSync(join(web, "till.html"), await res.text());
console.log("web/ ready from", server, "container", container.slice(0, 12));
