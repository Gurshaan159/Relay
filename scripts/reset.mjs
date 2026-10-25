import { rename, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
const target = process.env.RELAY_DATA_DIR;
if (!target)
  throw Error(
    "Set RELAY_DATA_DIR explicitly to the Relay data directory to reset. Stop Relay and its workers first.",
  );
const resolved = path.resolve(target);
if (
  resolved === path.parse(resolved).root ||
  resolved === os.homedir() ||
  resolved === process.cwd()
)
  throw Error("Refusing to reset a root, home or repository directory");
const backup =
  resolved + ".backup-" + new Date().toISOString().replace(/[:.]/g, "-");
if (!(await stat(path.join(resolved, "relay.sqlite"))).isFile())
  throw Error("This directory does not contain Relay SQLite data");
await rename(resolved, backup);
await mkdir(resolved, { recursive: true, mode: 0o700 });
console.log(
  `Previous data preserved at ${backup}. Run npm run seed to create a clean demo.`,
);
