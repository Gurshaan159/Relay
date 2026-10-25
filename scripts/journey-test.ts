import { _electron as electron, chromium } from "playwright";
import { createRequire } from "node:module";
import { mkdtemp, mkdir } from "node:fs/promises";
import path from "node:path";
import { fixture } from "../packages/server/fixture";
import { Store } from "../packages/shared-runtime/store";
import { Service } from "../packages/shared-runtime/service";
const require = createRequire(import.meta.url);
await mkdir("test-output", { recursive: true });
const root = await mkdtemp(path.resolve("test-output/journey-"));
const server = await fixture();
const store = new Store(root);
const service = new Service(store);
let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
try {
  const browser = await chromium.launchPersistentContext(
    path.join(root, "profiles", "alex", "local", "fixture"),
    { headless: true },
  );
  const page = browser.pages()[0];
  await page.goto("http://127.0.0.1:4318/login");
  await page.getByLabel("Email").fill("alex@example.test");
  await page.getByLabel("Password").fill("fixture-only");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/orders");
  await browser.close();
  store.put("connection", {
    id: "alex:local:fixture",
    owner: "alex",
    site: "fixture",
    location: "local",
    status: "Connected",
    account: "Fixture test account",
  });
  await service.request("alex", {
    method: "saveAgent",
    payload: {
      ...store.get("agent", "orders"),
      status: "Ready",
      untested: true,
    },
  });
  await service.close();
  store.close();
  app = await electron.launch({
    executablePath: process.env.RELAY_EXECUTABLE || require("electron"),
    args: process.env.RELAY_EXECUTABLE ? [] : ["."],
    env: { ...process.env, RELAY_DATA_DIR: root, RELAY_HEADLESS: "1" },
  });
  const window = await app.firstWindow();
  await window
    .getByRole("heading", { name: "My agents", exact: true })
    .waitFor({ timeout: 30000 });
  await window.getByRole("button", { name: "Run", exact: true }).click();
  await window.getByRole("button", { name: "Start run", exact: true }).click();
  await window
    .getByRole("button", { name: "Review complete · Resume", exact: true })
    .waitFor({ timeout: 30000 });
  await window.screenshot({ path: "test-output/activity-needs-input.png" });
  await window
    .getByRole("button", { name: "Review complete · Resume", exact: true })
    .click();
  await window
    .getByText("Completed", { exact: true })
    .waitFor({ timeout: 30000 });
  await window.getByRole("tab", { name: "Results", exact: true }).click();
  await window.getByRole("cell", { name: "NS-1042", exact: true }).waitFor();
  await window.screenshot({ path: "test-output/results-real.png" });
  await window
    .locator(".mantine-Paper-root")
    .filter({ hasText: "filter-output.xlsx" })
    .getByRole("button", { name: "Preview", exact: true })
    .click();
  await window.getByRole("heading", { name: "Summary", exact: true }).waitFor();
  await window.waitForFunction(() => {
    const dialog = document.querySelector(".mantine-Modal-content");
    return dialog && getComputedStyle(dialog).opacity === "1";
  });
  await window.screenshot({
    path: "test-output/workbook-preview.png",
    animations: "disabled",
  });
  console.log(
    "Real Electron run, human review, upload, persisted Results and workbook preview passed.",
  );
} finally {
  if (app) await app.close();
  await service.close();
  try {
    store.close();
  } catch {}
  await new Promise<void>((r) => server.close(() => r()));
}
