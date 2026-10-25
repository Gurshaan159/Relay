import { _electron as electron, chromium, type Page } from "playwright";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { fixture } from "../packages/server/fixture";
import { Store } from "../packages/shared-runtime/store";
const require = createRequire(import.meta.url);
await mkdir("test-output", { recursive: true });
const root = await mkdtemp(path.resolve("test-output/recording-journey-"));
const server = await fixture();
const store = new Store(root);
store.seed();
let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
const stages: string[] = [];
async function shot(page: Page, name: string) {
  await page.screenshot({
    path: path.join(root, name + ".png"),
    animations: "disabled",
  });
  stages.push(name);
  console.log(name);
}
try {
  // No prepared account or successful runs: every action goes through the app.
  app = await electron.launch({
    executablePath: require("electron"),
    args: ["."],
    env: { ...process.env, RELAY_DATA_DIR: root, RELAY_TEST_CAPTURE: "1" },
    recordVideo: {
      dir: path.join(root, "videos"),
      size: { width: 1320, height: 900 },
    },
  });
  const window = await app.firstWindow();
  window.setDefaultTimeout(15000);
  await window
    .getByRole("heading", { name: "My agents", exact: true })
    .waitFor();
  await window
    .getByRole("button", { name: "Create agent", exact: true })
    .click();
  await window.getByLabel("Agent name").fill("Find overdue orders");
  await window
    .getByLabel("Desired outcome")
    .fill("Collect overdue orders for review.");
  await window.getByRole("button", { name: "Continue", exact: true }).click();
  await shot(window, "01-start-recording");
  await window
    .getByRole("button", { name: "Start recording", exact: true })
    .click();
  let session: any;
  for (let i = 0; i < 150; i++) {
    session = store.all("recordingSession").at(-1);
    if (session?.status === "recording") break;
    if (session?.status === "error") throw Error(session.error);
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(session?.status, "recording");
  const port = (
    await readFile(
      path.join(
        root,
        "recording-profiles/alex",
        session.id,
        "DevToolsActivePort",
      ),
      "utf8",
    )
  ).split("\n")[0];
  const recorder = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const page = recorder.contexts()[0].pages()[0];
  await page.waitForURL("**/login");
  await page.getByText(/Recording ·/).waitFor();
  await page.getByLabel("Email").fill("fictional@example.test");
  await page.getByLabel("Password").fill("fixture-secret-never-captured");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/orders");
  await page.getByText(/Recording ·/).waitFor();
  await page.getByLabel("Search orders").fill("overdue");
  await page.keyboard.press("Tab");
  await shot(page, "02-recording-browser");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: "Resume", exact: true }).waitFor();
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await window.getByRole("heading", { name: "Make it repeatable" }).waitFor();
  await shot(window, "03-recorded-review");
  const recording = store.get("recording", session.id)!;
  assert.ok(
    !JSON.stringify(recording).includes("fixture-secret-never-captured"),
  );
  assert.ok(
    recording.events.some(
      (e: any) => e.action === "fill" && e.value === "overdue",
    ),
  );
  // Remove sign-in from the reusable workflow: the real connection supplies authentication.
  while (
    (await window.getByLabel("Page URL").first().inputValue()).endsWith(
      "/login",
    )
  ) {
    await window
      .getByRole("button", { name: "Remove", exact: true })
      .first()
      .click();
    if (
      (
        await window.getByLabel("Step 1 name", { exact: true }).inputValue()
      ).includes("Sign in")
    )
      await window
        .getByRole("button", { name: "Remove", exact: true })
        .first()
        .click();
  }
  await window.getByRole("button", { name: "Add step", exact: true }).click();
  await window
    .getByLabel("Action", { exact: true })
    .and(window.locator("input"))
    .last()
    .click();
  await window.getByRole("option", { name: "read", exact: true }).click();
  await window
    .getByLabel("Recommendation", { exact: true })
    .and(window.locator("input"))
    .last()
    .click();
  await window.getByRole("option", { name: "Automate", exact: true }).click();
  await window
    .getByLabel("Target", { exact: true })
    .last()
    .fill("css=#records");
  await window.getByLabel("Output name", { exact: true }).last().fill("orders");
  await window.getByRole("button", { name: "Continue", exact: true }).click();
  await window.getByRole("button", { name: "Open sign-in browser", exact: true }).click();
  const loginPortFile = path.join(root, "profiles/alex/local/fixture/DevToolsActivePort");
  let loginPort = "";
  for (let i = 0; i < 100; i++) {
    try { loginPort = (await readFile(loginPortFile, "utf8")).split("\n")[0]; if (loginPort) break; } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  const loginBrowser = await chromium.connectOverCDP(`http://127.0.0.1:${loginPort}`);
  const loginPage = loginBrowser.contexts()[0].pages()[0];
  await loginPage.waitForURL("**/login");
  await loginPage.getByLabel("Email").fill("alex@example.test");
  await loginPage.getByLabel("Password").fill("fictional-connection-only");
  await loginPage.getByRole("button", { name: "Sign in", exact: true }).click();
  await loginPage.waitForURL("**/orders");
  await window.getByRole("button", { name: "I’ve signed in", exact: true }).click();
  await window.getByText("Connected", { exact: true }).waitFor();
  assert.equal(store.get("connection", "alex:local:fixture")?.status, "Connected");
  await shot(window, "04-connected");
  await window.getByRole("button", { name: "Continue", exact: true }).click();
  await window.getByRole("button", { name: "Run test", exact: true }).click();
  await window
    .getByText("Completed", { exact: true })
    .waitFor({ timeout: 45000 });
  await shot(window, "05-test-completed");
  await window.getByRole("button", { name: "Continue", exact: true }).click();
  await window
    .getByRole("button", { name: "Save and enable", exact: true })
    .click();
  await window
    .locator(".agent-title")
    .filter({ hasText: "Find overdue orders" })
    .click();
  await window.getByRole("button", { name: "Run agent", exact: true }).click();
  await window.getByRole("button", { name: "Start run", exact: true }).click();
  await window
    .getByText("Completed", { exact: true })
    .first()
    .waitFor({ timeout: 45000 });
  const agent = store
    .all("agent")
    .find((a) => a.name === "Find overdue orders")!;
  for (let i = 0; i < 150; i++) {
    if (
      store
        .all("run")
        .filter((r) => r.agentId === agent.id && r.state === "Completed")
        .length >= 2
    )
      break;
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.equal(
    store
      .all("run")
      .filter((r) => r.agentId === agent.id && r.state === "Completed").length,
    2,
  );
  await window.getByRole("tab", { name: "Results", exact: true }).click();
  await window
    .getByRole("cell", { name: "NS-1042", exact: true })
    .first()
    .waitFor();
  await shot(window, "06-persisted-results");
  await writeFile(
    path.join(root, "result.json"),
    JSON.stringify(
      {
        passed: true,
        stages,
        runIds: store
          .all("run")
          .filter((r) => r.agentId === agent.id)
          .map((r) => r.id),
        recordedActions: recording.events.length,
      },
      null,
      2,
    ),
  );
  console.log(`PASS. Video and screenshots: ${root}`);
} catch (error) {
  if (app) await shot(await app.firstWindow(), "failure").catch(() => {});
  console.error(`Evidence: ${root}`);
  throw error;
} finally {
  if (app) {
    const video = (await app.firstWindow()).video();
    await app.close();
    await video?.saveAs(path.join(root, "app-journey.webm"));
  }
  store.close();
  await new Promise<void>((r) => server.close(() => r()));
}
