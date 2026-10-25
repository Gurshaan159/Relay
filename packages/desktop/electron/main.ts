import { app, BrowserWindow, ipcMain, safeStorage, shell } from "electron";
import { Worker } from "node:worker_threads";
import path from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { sites, employees, requestSchema } from "../../shared-runtime/schema";
let worker: Worker;
let window: BrowserWindow;
let active = "alex";
let sequence = 0;
const pending = new Map<
  number,
  { resolve: (v: any) => void; reject: (e: any) => void }
>();
app.whenReady().then(async () => {
  const root = process.env.RELAY_DATA_DIR || app.getPath("userData");
  await mkdir(path.join(root, "secrets"), { recursive: true, mode: 0o700 });
  worker = new Worker(path.join(__dirname, "service.cjs"), {
    env: { ...process.env, RELAY_DATA_DIR: process.env.RELAY_DATA_DIR || root },
  });
  worker.on("message", async (m) => {
    if (m.secret) {
      try {
        if (
          !safeStorage.isEncryptionAvailable() ||
          (process.platform === "linux" &&
            safeStorage.getSelectedStorageBackend() === "basic_text")
        )
          throw Error(
            "OS secure storage is unavailable. Configure a system keyring.",
          );
        const file = path.join(
          root,
          "secrets",
          Buffer.from(m.id).toString("hex"),
        );
        let value = "";
        if (m.secret === "set")
          await writeFile(file, safeStorage.encryptString(m.value), {
            mode: 0o600,
          });
        else value = safeStorage.decryptString(await readFile(file));
        worker.postMessage({
          secretResult: true,
          requestId: m.requestId,
          value,
        });
      } catch (e) {
        worker.postMessage({
          secretResult: true,
          requestId: m.requestId,
          error: (e as Error).message,
        });
      }
      return;
    }
    const p = pending.get(m.id);
    pending.delete(m.id);
    m.error ? p?.reject(Error(m.error)) : p?.resolve(m.value);
  });
  window = new BrowserWindow({
    width: 1320,
    height: 900,
    minWidth: 960,
    minHeight: 680,
    backgroundColor: "#f6f8fa",
    title: "Relay",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (e) => e.preventDefault());
  const trusted = (e: Electron.IpcMainInvokeEvent) => {
    if (
      e.sender !== window.webContents ||
      e.senderFrame !== window.webContents.mainFrame
    )
      throw Error("Untrusted renderer");
  };
  ipcMain.handle("relay:request", (event, request) => {
    trusted(event);
    const parsed = requestSchema.parse(request);
    if (parsed.method === "openSource") {
      const url = new URL(String(parsed.payload.url));
      if (
        !sites.some((s) => s.origin === url.origin) ||
        url.username ||
        url.password
      )
        throw Error("Source is not approved");
      return shell.openExternal(url.href);
    }
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve, reject });
      worker.postMessage({ id, owner: active, request: parsed });
    });
  });
  ipcMain.handle("relay:switch", async (event, id) => {
    trusted(event);
    if (!employees.some((e) => e.id === id)) throw Error("Unknown employee");
    await new Promise((resolve, reject) => {
      const requestId = ++sequence;
      pending.set(requestId, { resolve, reject });
      worker.postMessage({
        id: requestId,
        owner: active,
        request: { method: "deactivate", payload: {} },
      });
    });
    active = id;
  });
  if (process.env.RELAY_DEV) await window.loadURL("http://127.0.0.1:5173");
  else await window.loadFile(path.join(__dirname, "../renderer/index.html"));
});
app.on("window-all-closed", () => app.quit());
let closing = false;
app.on("before-quit", (e) => {
  if (worker && !closing) {
    e.preventDefault();
    closing = true;
    worker.postMessage({ close: true });
    const timeout = setTimeout(
      () => void worker.terminate().then(() => app.quit()),
      5000,
    );
    worker.on("message", (m) => {
      if (m.closed) {
        clearTimeout(timeout);
        void worker.terminate().then(() => app.quit());
      }
    });
  }
});
