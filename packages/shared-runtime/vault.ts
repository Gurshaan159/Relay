import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
/** Hosted deployments supply a key through their secret manager, never through the UI or database. */
export function hostedVault(root: string) {
  const raw = process.env.RELAY_MASTER_KEY;
  if (!raw) return undefined;
  const key = Buffer.from(raw, "hex");
  if (key.length !== 32)
    throw Error("RELAY_MASTER_KEY must be 32 random bytes encoded as hex");
  const file = (id: string) =>
    path.join(root, "secrets", Buffer.from(id).toString("hex"));
  return {
    async set(id: string, value: string) {
      await mkdir(path.join(root, "secrets"), { recursive: true, mode: 0o700 });
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const encrypted = Buffer.concat([
        cipher.update(value, "utf8"),
        cipher.final(),
      ]);
      await writeFile(
        file(id),
        Buffer.concat([iv, cipher.getAuthTag(), encrypted]),
        { mode: 0o600 },
      );
    },
    async get(id: string) {
      const bytes = await readFile(file(id));
      const cipher = createDecipheriv(
        "aes-256-gcm",
        key,
        bytes.subarray(0, 12),
      );
      cipher.setAuthTag(bytes.subarray(12, 28));
      return Buffer.concat([
        cipher.update(bytes.subarray(28)),
        cipher.final(),
      ]).toString("utf8");
    },
  };
}
