import { build } from "esbuild";
await build({
  entryPoints: [
    "packages/desktop/electron/main.ts",
    "packages/desktop/electron/preload.ts",
    "packages/desktop/electron/service.ts",
  ],
  outdir: "dist/electron",
  bundle: true,
  platform: "node",
  format: "cjs",
  outExtension: { ".js": ".cjs" },
  external: ["electron", "playwright", "exceljs"],
  sourcemap: true,
});
