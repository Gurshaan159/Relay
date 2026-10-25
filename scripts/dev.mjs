import { spawn } from "node:child_process";
import { createRequire } from "node:module";
await import("./build.mjs");
const require = createRequire(import.meta.url);
const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js"], {
  stdio: "inherit",
});
await new Promise((r) => setTimeout(r, 1800));
const electron = spawn(require("electron"), ["."], {
  stdio: "inherit",
  env: { ...process.env, RELAY_DEV: "1" },
});
const stop = () => {
  electron.kill();
  vite.kill();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
electron.on("exit", () => {
  vite.kill();
  process.exit();
});
