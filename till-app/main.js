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
