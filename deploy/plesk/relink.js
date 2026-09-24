// Turbopack externals are hashed symlinks in .next/node_modules pointing into pnpm's .pnpm store.
// The package ships a flat node_modules instead, so point every such link at the plain package folder.
const fs = require("fs");
const path = require("path");
const root = process.argv[2];
const nm = path.join(root, ".next", "node_modules");
let fixed = 0;
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isSymbolicLink()) {
      const rel = path.relative(nm, p).split(path.sep).join("/");
      const pkg = rel.replace(/-[0-9a-f]{16}$/, "");
      const target = path.join(root, "node_modules", pkg);
      if (!fs.existsSync(target)) { console.error("missing package for", rel); process.exitCode = 1; continue; }
      fs.unlinkSync(p);
      fs.symlinkSync(path.relative(path.dirname(p), target), p, "dir");
      fixed++;
    } else if (e.isDirectory()) walk(p);
  }
}
if (fs.existsSync(nm)) walk(nm);
console.log("relinked", fixed);
