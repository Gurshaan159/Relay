import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fixture } from "../packages/server/fixture";
const require = createRequire(import.meta.url);
const root = path.resolve(process.env.RELAY_DATA_DIR || ".relay/presentation");
await mkdir(root, { recursive: true, mode: 0o700 });
const secretFile = path.join(root, "fixture-session.key");
let secret: string;
try { secret = await readFile(secretFile, "utf8"); }
catch { secret = randomBytes(32).toString("hex"); await writeFile(secretFile, secret, { mode: 0o600 }); }
let server: Awaited<ReturnType<typeof fixture>>;
try { server = await fixture(4318, secret); }
catch { console.error("The demo website is already running. Close the other fixture/demo process, then run npm run demo again."); process.exit(1); }
const env = { ...process.env, RELAY_DATA_DIR: root };
delete env.ELECTRON_RUN_AS_NODE;
const app = spawn(require("electron"), ["."], { env, stdio: "inherit", windowsHide: true });
console.log("Relay presentation workspace is opening. Use fictional credentials on the Northstar fixture website. Close Relay to stop the demo.");
const stop = () => { server.closeAllConnections(); server.close(); };
app.on("exit", () => stop());
app.on("error", error => { console.error(error.message); stop(); process.exitCode = 1; });
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => { app.kill(); stop(); });
