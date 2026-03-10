const { app, BrowserWindow, ipcMain, shell } = require("electron");
const fs = require("fs/promises");
const path = require("path");

const browserDistPath = path.join(
  __dirname,
  "dist",
  "monthly-report-app",
  "browser",
);
const EXPORTS_DIR_NAME = "Monthly Report Exports";

function logNonBlocking(context, error) {
  console.warn(`[${context}]`, error);
}

function getExportsBaseDir() {
  return path.resolve(path.join(app.getPath("documents"), EXPORTS_DIR_NAME));
}

function sanitizeFileName(fileName) {
  const fallback = "export.xlsx";
  const raw = typeof fileName === "string" ? fileName.trim() : "";
  const base = path.basename(raw || fallback);
  const sanitized = base.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
  return sanitized || fallback;
}

function ensureXlsxExtension(fileName) {
  if (fileName.toLowerCase().endsWith(".xlsx")) return fileName;
  return `${fileName}.xlsx`;
}

function toNodeBuffer(binary) {
  if (binary instanceof ArrayBuffer) {
    return Buffer.from(binary);
  }
  if (ArrayBuffer.isView(binary)) {
    return Buffer.from(binary.buffer, binary.byteOffset, binary.byteLength);
  }
  throw new Error("Invalid binary payload");
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, "icon/icon.ico"),
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  const devIndex = path.join(browserDistPath, "index.html");
  const prodIndex = path.join(browserDistPath, "index.html");

  win
    .loadFile(app.isPackaged ? prodIndex : devIndex)
    .catch((err) => console.error("Load error:", err));

  win.webContents.on("did-finish-load", () => {
    // Reset zoom at startup so packaged app always opens at 100%.
    win.webContents.setZoomFactor(1);
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (typeof url === "string" && /^https?:|^mailto:/i.test(url)) {
      shell.openExternal(url).catch((error) => {
        logNonBlocking("BrowserWindow.openExternal", error);
      });
    }
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    if (typeof url !== "string") return;
    if (url.startsWith("file://")) return;
    event.preventDefault();
    if (/^https?:|^mailto:/i.test(url)) {
      shell.openExternal(url).catch((error) => {
        logNonBlocking("BrowserWindow.willNavigate.openExternal", error);
      });
    }
  });

  win.webContents.session.setPermissionRequestHandler(
    (_webContents, _permission, callback) => {
      callback(false);
    },
  );

  if (!app.isPackaged) win.webContents.openDevTools();
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle("read-asset-file", async (_event, relativeAssetPath) => {
  if (typeof relativeAssetPath !== "string" || !relativeAssetPath.trim()) {
    throw new Error("Invalid asset path");
  }

  const normalized = path.normalize(relativeAssetPath).replace(/^([/\\])+/, "");
  const baseDir = path.resolve(browserDistPath);
  const resolved = path.resolve(baseDir, normalized);
  const templatesDir = path.resolve(path.join(baseDir, "assets", "templates"));

  if (!resolved.startsWith(baseDir)) {
    throw new Error("Asset path traversal blocked");
  }
  if (!resolved.startsWith(templatesDir)) {
    throw new Error("Asset path outside templates directory");
  }
  if (path.extname(resolved).toLowerCase() !== ".xlsx") {
    throw new Error("Unsupported asset extension");
  }

  const data = await fs.readFile(resolved);
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
});

ipcMain.handle("save-export-file", async (_event, fileName, binary) => {
  const safeName = ensureXlsxExtension(sanitizeFileName(fileName));
  const baseDir = getExportsBaseDir();
  await fs.mkdir(baseDir, { recursive: true });

  const ext = path.extname(safeName) || ".xlsx";
  const baseName = path.basename(safeName, ext);
  const stamped = `${baseName}-${Date.now()}${ext}`;
  const target = path.resolve(path.join(baseDir, stamped));

  if (!target.startsWith(baseDir)) {
    throw new Error("Export path traversal blocked");
  }

  const payload = toNodeBuffer(binary);
  await fs.writeFile(target, payload);

  return { path: target };
});

ipcMain.handle("open-export-file", async (_event, filePath) => {
  if (typeof filePath !== "string" || !filePath.trim()) {
    return { ok: false, error: "Invalid file path" };
  }

  const baseDir = getExportsBaseDir();
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(baseDir)) {
    return { ok: false, error: "File path outside exports directory" };
  }

  try {
    await fs.access(resolved);
  } catch {
    return { ok: false, error: "File not found" };
  }

  const shellError = await shell.openPath(resolved);
  return { ok: shellError === "", error: shellError || null };
});
