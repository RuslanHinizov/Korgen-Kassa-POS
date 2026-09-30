/**
 * Korgen Kassa till program (plan section 12, stage A4). A small window around the till screen:
 *  - the till screens (web/) live INSIDE the program, so it opens with no internet at all;
 *  - a tiny local web server on a fixed address serves them (a fixed address keeps the till's own saved data in one place);
 *  - everything the till needs from the server (/api, product images ...) is passed on to the market's server; when that
 *    cannot be reached the till gets a plain 503, which is exactly what its offline logic already treats as "no connection".
 */
const { app, BrowserWindow, Menu, ipcMain, shell, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const PORT = 38471;
const WEB = path.join(__dirname, "web");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
  ".webmanifest": "application/manifest+json",
};

/** The market server: KORGEN_SERVER_URL, else userData/config.json {"serverUrl": "..."}, else the live server. */
function serverUrl() {
  if (process.env.KORGEN_SERVER_URL) return process.env.KORGEN_SERVER_URL.replace(/\/+$/, "");
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(app.getPath("userData"), "config.json"), "utf8"));
    if (typeof cfg.serverUrl === "string" && cfg.serverUrl) return cfg.serverUrl.replace(/\/+$/, "");
  } catch {
    /* no config yet */
  }
  return "https://korgenkassa.kz";
}

function sendFile(res, file, immutable) {
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
      "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
    });
    res.end(data);
  });
}

/** A file under web/, or null if the path tries to leave it. */
function inside(rel) {
  const full = path.normalize(path.join(WEB, rel));
  return full.startsWith(WEB + path.sep) ? full : null;
}

function proxy(req, res) {
  const target = new URL(serverUrl());
  const lib = target.protocol === "https:" ? https : http;
  const headers = { ...req.headers, host: target.host, origin: target.origin };
  delete headers.referer;
  const up = lib.request(
    { protocol: target.protocol, hostname: target.hostname, port: target.port || undefined, method: req.method, path: req.url, headers, timeout: 30000 },
    (r) => {
      res.writeHead(r.statusCode || 502, r.headers);
      r.pipe(res);
    },
  );
  const offline = () => {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    const api = req.url.startsWith("/api/");
    res.writeHead(503, { "content-type": api ? "application/json" : "text/plain" });
    res.end(api ? JSON.stringify({ error: "offline" }) : "offline");
  };
  up.on("timeout", () => up.destroy());
  up.on("error", offline);
  req.pipe(up);
}

function handle(req, res) {
  const url = new URL(req.url, "http://local");
  let p;
  try {
    p = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400);
    res.end();
    return;
  }
  if (p === "/") {
    res.writeHead(302, { location: "/till" });
    res.end();
    return;
  }
  if (p === "/till" || p === "/till/") return sendFile(res, path.join(WEB, "till.html"), false);
  if (p.startsWith("/_next/static/")) {
    const f = inside(p);
    return f ? sendFile(res, f, true) : proxy(req, res);
  }
  const pub = inside(path.join("public", p));
  if (pub && fs.existsSync(pub) && fs.statSync(pub).isFile()) return sendFile(res, pub, false);
  return proxy(req, res);
}

/**
 * Automatic updates. The program looks for a newer version by itself when it starts and every few hours (only when the
 * market's server answers), downloads it quietly, and installs it the next time the program is closed — it never restarts
 * in the middle of a sale. "ПРОВЕРИТЬ ОБНОВЛЕНИЕ" in ДОП. ФУНКЦИИ can ask right now and offer to install at once.
 * The versions are files on the market's server (Korgen Kassa serves /till-updates/), see docs/till-updates.md.
 */
let update = { state: "idle", version: null, message: null };
function updateFeed() {
  return process.env.KORGEN_UPDATE_URL ? process.env.KORGEN_UPDATE_URL.replace(/\/+$/, "") : serverUrl() + "/till-updates";
}
function logUpdate(line) {
  try {
    fs.appendFileSync(path.join(app.getPath("userData"), "update.log"), new Date().toISOString() + " " + line + "\n");
  } catch {
    /* logging is best effort */
  }
}
async function checkForUpdate() {
  if (!app.isPackaged && !process.env.KORGEN_FORCE_UPDATES) return update;
  try {
    autoUpdater.setFeedURL({ provider: "generic", url: updateFeed() });
    await autoUpdater.checkForUpdates();
  } catch (e) {
    update = { state: "error", version: null, message: String((e && e.message) || e) };
    logUpdate("check failed: " + update.message);
  }
  return update;
}
function setupUpdates() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;
  autoUpdater.logger = null;
  autoUpdater.on("update-available", (i) => {
    update = { state: "downloading", version: i.version, message: null };
    logUpdate("available " + i.version);
  });
  autoUpdater.on("update-not-available", () => {
    update = { state: "none", version: null, message: null };
    logUpdate("none");
  });
  autoUpdater.on("update-downloaded", (i) => {
    update = { state: "ready", version: i.version, message: null };
    logUpdate("downloaded " + i.version);
  });
  autoUpdater.on("error", (e) => {
    update = { state: "error", version: null, message: String((e && e.message) || e) };
    logUpdate("error " + update.message);
  });
  ipcMain.handle("update:check", () => checkForUpdate());
  ipcMain.handle("update:status", () => update);
  ipcMain.on("update:install", () => {
    if (update.state === "ready") autoUpdater.quitAndInstall(false, true);
  });
  setTimeout(() => void checkForUpdate(), 20_000);
  setInterval(() => void checkForUpdate(), 4 * 3600_000);
}

/**
 * Receipt printing. The cashier's screen hands over the finished receipt (HTML with its styles); the program prints it
 * silently — no dialog — on the receipt printer through its normal Windows driver, so Russian letters, ₸ and the paper
 * width are the driver's job. Which printer: {"printer": "XP-76"} in %APPDATA%\Korgen Kassa\config.json, else the first
 * installed printer that looks like a receipt printer (XP-..., POS-..., Xprinter, thermal, receipt), else the Windows default.
 */
const VIRTUAL_PRINTER = /onenote|pdf|xps|fax|anydesk|microsoft print|send to/i;
const RECEIPT_PRINTER = /(^|[^a-z])(xp|pos)[-\s]?\d|xprinter|thermal|receipt|чек/i;
function configuredPrinter() {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(app.getPath("userData"), "config.json"), "utf8"));
    return typeof cfg.printer === "string" && cfg.printer ? cfg.printer : null;
  } catch {
    return null;
  }
}
async function pickPrinter(webContents) {
  const printers = await webContents.getPrintersAsync();
  const want = configuredPrinter();
  if (want) {
    const hit = printers.find((p) => p.name === want);
    if (hit) return hit.name;
  }
  const real = printers.filter((p) => !VIRTUAL_PRINTER.test(p.name));
  const receipt = real.find((p) => RECEIPT_PRINTER.test(p.name));
  if (receipt) return receipt.name;
  const def = real.find((p) => p.isDefault) || real[0];
  return def ? def.name : null;
}
/**
 * The receipt is drawn in a hidden window, photographed at the printer's own resolution (203 dpi, 64 mm wide), and that
 * picture is sent to the Windows driver by a tiny PowerShell script (System.Drawing). Chromium's own silent print
 * produced blank strips on roll printers whose driver has a "continuous" paper size; a plain bitmap job prints right.
 */
const PRINT_SCRIPT = [
  "param([string]$Printer, [string]$Image)",
  "Add-Type -AssemblyName System.Drawing",
  "$img = [System.Drawing.Image]::FromFile($Image)",
  "$doc = New-Object System.Drawing.Printing.PrintDocument",
  "$doc.PrinterSettings.PrinterName = $Printer",
  "if (-not $doc.PrinterSettings.IsValid) { Write-Error 'printer not found'; exit 2 }",
  "$doc.DocumentName = 'Korgen Kassa receipt'",
  "$doc.add_PrintPage({ param($s, $e)",
  "  $w = [Math]::Min(250.0, $e.PageSettings.PrintableArea.Width)",
  "  $h = $w * $img.Height / $img.Width",
  "  $e.Graphics.DrawImage($img, 0, 0, $w, $h)",
  "  $e.HasMorePages = $false })",
  "$doc.Print()",
  "$img.Dispose()",
].join("\r\n");

async function printReceiptHtml(html) {
  const dots = 512; // 64 mm at 203 dpi
  const cssWidth = Math.round((64 / 25.4) * 96); // the same 64 mm in CSS pixels
  const zoom = dots / cssWidth;
  const win = new BrowserWindow({
    show: false,
    width: dots, // zoomed: 512 window pixels show the receipt's 64 mm (242 CSS pixels) laid out at full size
    height: 400,
    useContentSize: true,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, offscreen: false, zoomFactor: zoom },
  });
  const tmp = path.join(app.getPath("temp"), "korgen-receipt-" + Date.now());
  try {
    await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
    const deviceName = await pickPrinter(win.webContents);
    if (!deviceName) return { ok: false, error: "Принтер не найден. Установите драйвер принтера." };
    const cssHeight = await win.webContents.executeJavaScript("Math.ceil(document.documentElement.scrollHeight)");
    const height = Math.max(60, Math.ceil(cssHeight * zoom));
    win.setContentSize(dots, height);
    await new Promise((r) => setTimeout(r, 400)); // let the layout settle at the new size
    const image = await win.webContents.capturePage({ x: 0, y: 0, width: dots, height });
    fs.writeFileSync(tmp + ".png", image.toPNG());
    fs.writeFileSync(tmp + ".ps1", "\ufeff" + PRINT_SCRIPT);
    const result = await new Promise((resolve) => {
      require("child_process").execFile(
        "powershell.exe",
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", tmp + ".ps1", deviceName, tmp + ".png"],
        { windowsHide: true, timeout: 60_000 },
        (err, _out, errOut) => resolve(err ? { ok: false, error: String(errOut || err.message).trim().slice(0, 300) } : { ok: true, printer: deviceName }),
      );
    });
    if (process.env.KORGEN_PRINT_DEBUG) fs.copyFileSync(tmp + ".png", path.join(app.getPath("userData"), "print-debug.png"));
    return result;
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  } finally {
    setTimeout(() => {
      win.destroy();
      for (const ext of [".png", ".ps1"]) fs.rm(tmp + ext, { force: true }, () => {});
    }, 3000);
  }
}

let server;
function startServer() {
  return new Promise((resolve, reject) => {
    server = http.createServer(handle);
    server.once("error", reject);
    server.listen(PORT, "127.0.0.1", () => resolve());
  });
}

let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    backgroundColor: "#ffffff",
    autoHideMenuBar: true,
    title: "Korgen Kassa",
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.maximize();
  win.once("ready-to-show", () => win.show());
  win.loadURL(`http://127.0.0.1:${PORT}/till`);
  // links to other sites open in the normal browser, never inside the till window
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url) && !url.startsWith(`http://127.0.0.1:${PORT}`)) void shell.openExternal(url);
    return { action: "deny" };
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  Menu.setApplicationMenu(null);
  app.whenReady().then(async () => {
    try {
      await startServer();
    } catch (e) {
      dialog.showErrorBox("Korgen Kassa", `Не удалось запустить кассу: порт ${PORT} занят другой программой.\n${e.message}`);
      app.quit();
      return;
    }
    ipcMain.handle("print:receipt", (_e, html) => (typeof html === "string" && html.length < 3_000_000 ? printReceiptHtml(html) : { ok: false, error: "bad receipt" }));
    ipcMain.on("shell:minimize", () => win && win.minimize());
    ipcMain.on("shell:quit", () => app.quit());
    ipcMain.handle("shell:info", () => ({ version: app.getVersion(), serverUrl: serverUrl() }));
    createWindow();
    setupUpdates();
  });
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", () => {
    if (server) server.close();
  });
}
