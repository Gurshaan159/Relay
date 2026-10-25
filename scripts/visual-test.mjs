import { _electron as electron } from "playwright";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
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
  if (await window.getByRole("menuitem", { name: "Admin", exact: true }).count())
    throw Error("Admin view offered to a non-admin employee");
  await window.getByRole("menuitem", { name: /Alex Morgan/ }).click();
  await window
    .getByRole("heading", { name: "My agents", exact: true })
    .waitFor();
  await window.locator(".profile").click();
  await window.getByRole("menuitem", { name: "Admin", exact: true }).click();
  await window.getByRole("heading", { name: "Teams", exact: true }).waitFor();
  await window.screenshot({ path: "test-output/admin-teams.png" });
  await window.getByRole("button", { name: "View team" }).first().click();
  await window.getByRole("heading", { name: "Members" }).waitFor();
  await window.screenshot({ path: "test-output/admin-team.png" });
  for (const [nav, heading, file] of [
    ["Approved websites", "Approved websites", "admin-websites"],
    ["Data", "No data collections yet", "admin-data"],
    ["Budget", "Budgets aren’t available yet", "admin-budget"],
  ]) {
    await window.getByRole("button", { name: nav, exact: true }).click();
    await window.getByRole("heading", { name: heading, exact: true }).waitFor();
    await window.screenshot({ path: `test-output/${file}.png` });
  }
  await window.getByRole("button", { name: "Data", exact: true }).click();
  await window.getByRole("button", { name: "Add collection" }).first().click();
  await window.getByRole("dialog").screenshot({
    path: "test-output/admin-add-collection.png",
  });
  const teams = ["Billing", "Shipping", "Technical"];
  await writeFile(
    "test-output/inbox.csv",
    [
      "message,team",
      ...teams.flatMap((t) =>
        Array.from(
          { length: 12 },
          (_, i) => `Customer message ${i} about a ${t.toLowerCase()} issue,${t}`,
        ),
      ),
    ].join("\n"),
  );
  const dialog = window.getByRole("dialog");
  await dialog.getByLabel("Name").fill("Support inbox");
  await dialog.locator('input[type="file"]').setInputFiles("test-output/inbox.csv");
  await dialog.getByRole("button", { name: "Add collection" }).click();
  await window.getByRole("button", { name: "Create a model" }).click();
  await window
    .getByText("This data fits text classification")
    .waitFor({ timeout: 30000 });
  await window.screenshot({ path: "test-output/model-data.png", fullPage: true });
  await window.getByRole("button", { name: "Continue" }).click();
  await window.getByRole("button", { name: "Use this" }).click();
  await window.screenshot({ path: "test-output/model-goal.png" });
  await window.getByRole("button", { name: "Review plan" }).click();
  await window.getByRole("heading", { name: "Review the plan" }).waitFor();
  await window.getByRole("heading", { name: "Connect Hugging Face" }).waitFor();
  if (!(await window.getByRole("button", { name: "Start training" }).isDisabled()))
    throw Error("Training must stay disabled until connected and approved");
  await window.screenshot({ path: "test-output/model-plan.png", fullPage: true });
  await window.getByRole("button", { name: "Back to data" }).click();
  await window.locator(".profile").click();
  await window.getByRole("menuitem", { name: "Employee", exact: true }).click();
  await window
    .getByRole("heading", { name: "My agents", exact: true })
    .waitFor();
  console.log(
    "Electron visual smoke passed; screenshots saved in test-output.",
  );
} finally {
  await app.close();
}
