import { _electron as electron } from "playwright";
import { createRequire } from "node:module";
import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
const require = createRequire(import.meta.url);
await mkdir("test-output", { recursive: true });
const app = await electron.launch({
  executablePath: process.env.RELAY_EXECUTABLE || require("electron"),
  args: process.env.RELAY_EXECUTABLE ? [] : ["."],
  env: {
    ...process.env,
    RELAY_DATA_DIR: await mkdtemp(path.resolve("test-output/visual-data-")),
  },
});
try {
  const window = await app.firstWindow();
  window.on("console", (m) => {
    if (m.type() === "error") console.error(m.text());
  });
  window.on("pageerror", (e) => console.error(e));
  await window
    .getByRole("heading", { name: "My agents", exact: true })
    .waitFor({ timeout: 30000 });
  await window.screenshot({ path: "test-output/my-agents.png" });
  await window
    .getByRole("button", { name: "Create agent", exact: true })
    .click();
  await window
    .getByRole("textbox", { name: /Agent name/ })
    .fill("Review incoming orders");
  await window
    .getByLabel("Desired outcome")
    .fill("Collect order records for a weekly review.");
  await window.screenshot({ path: "test-output/create-agent.png" });
  await window.getByRole("button", { name: "Save & close" }).click();
  await window
    .getByRole("button", { name: "Connections", exact: true })
    .click();
  await window.screenshot({ path: "test-output/connections.png" });
  await window.getByRole("button", { name: "My agents", exact: true }).click();
  await window
    .locator(".agent-title")
    .filter({ hasText: "Overdue orders" })
    .click();
  await window.getByRole("tab", { name: "Results", exact: true }).click();
  await window
    .getByRole("heading", { name: "Useful work lands here" })
    .waitFor();
  await window.screenshot({ path: "test-output/results-empty.png" });
  await window.locator(".profile").click();
  await window.getByRole("menuitem", { name: /Sam Rivera/ }).click();
  await window
    .getByRole("heading", { name: "Make room for your best work" })
    .waitFor();
  if (
    await window
      .locator(".agent-title")
      .filter({ hasText: "Overdue orders" })
      .count()
  )
    throw Error("Previous employee agent leaked");
  await window.locator(".profile").click();
  await window.getByRole("menuitem", { name: "Admin", exact: true }).click();
  await window
    .getByRole("heading", { name: "Admin workspace coming later" })
    .waitFor();
  await window.getByRole("button", { name: "Return to Employee" }).click();
  console.log(
    "Electron visual smoke passed; screenshots saved in test-output.",
  );
} finally {
  await app.close();
}
