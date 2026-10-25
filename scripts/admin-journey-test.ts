import { _electron as electron, type Page } from "playwright";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { Store } from "../packages/shared-runtime/store";
const require = createRequire(import.meta.url);
await mkdir("test-output", { recursive: true });
const root = await mkdtemp(path.resolve("test-output/admin-journey-"));
const csv = path.join(root, "orders.csv"), xlsx = path.join(root, "accounts.xlsx"), empty = path.join(root, "empty.csv");
await writeFile(csv, "id,customer,status,amount\nNS-1042,Marlow Studio,overdue,1250\nNS-1043,Cedar Supply,paid,480\nNS-1044,Fieldwork Co.,overdue,720\n");
await writeFile(empty, "");
const book = new ExcelJS.Workbook(); book.addWorksheet("Accounts").addRows([["id", "account"], ["A-101", "Marlow Studio"], ["A-102", "Cedar Supply"]]);
await book.xlsx.writeFile(xlsx);
const store = new Store(root); store.seed();
let app = await electron.launch({ executablePath: require("electron"), args: ["."], env: { ...process.env, RELAY_DATA_DIR: root }, recordVideo: { dir: path.join(root, "videos"), size: { width: 1320, height: 900 } } });
let window = await app.firstWindow(); window.setDefaultTimeout(15000);
const errors: string[] = []; window.on("pageerror", e => errors.push(e.message));
async function shot(name: string) { await window.screenshot({ path: path.join(root, name + ".png"), animations: "disabled", fullPage: true }); console.log(name); }
async function nav(name: string) { await window.getByRole("button", { name, exact: true }).click(); }
async function mode(name: string) { await window.locator(".profile").click(); await window.getByRole("menuitem", { name, exact: true }).click(); }
async function person(name: string) { await window.locator(".profile").click(); await window.getByRole("menuitem", { name: new RegExp(name) }).click(); }
async function choose(label: string, value: string) { await window.getByLabel(label, { exact: true }).and(window.locator("input")).click(); await window.getByRole("option", { name: value, exact: true }).click(); }
async function wait(check: () => boolean) { for(let i=0;i<100;i++){if(check())return;await new Promise(r=>setTimeout(r,100));} throw Error("Persisted change timed out"); }
async function add(name: string, file: string, team = "Operations") {
  await nav("Add collection"); const d = window.getByRole("dialog");
  await d.getByLabel("Name").fill(name);
  await d.getByLabel("Description").fill("Fictional data for the live Relay presentation.");
  await choose("Team that can use it", team);
  await d.locator('input[type="file"]').setInputFiles(file);
  await d.getByRole("button", { name: "Add collection", exact: true }).click();
  await d.waitFor({ state: "hidden" });
  await window.getByText(name, { exact: true }).waitFor();
}
try {
  await window.getByRole("heading", { name: "My agents", exact: true }).waitFor();
  await mode("Admin"); await window.getByRole("heading", { name: "Teams", exact: true }).waitFor();
  await shot("01-teams");
  await window.locator(".agent-title").filter({ hasText: "Operations" }).click();
  await choose("Team for Jordan Lee", "Customer success");
  await window.getByRole("dialog").getByRole("button", { name: "Move member" }).click();
  await wait(() => store.employee("jordan").team === "Customer success");
  await nav("Back to teams"); await window.locator(".agent-title").filter({ hasText: "Customer success" }).click();
  await window.getByText("Jordan Lee", { exact: true }).waitFor();
  await choose("Team for Jordan Lee", "Operations"); await window.getByRole("dialog").getByRole("button", { name: "Move member" }).click();
  await wait(() => store.employee("jordan").team === "Operations");
  await nav("Approved websites");
  const website = window.locator(".mantine-Paper-root").filter({ has: window.getByText("Northstar Orders · fixture", { exact: true }) });
  await website.getByRole("checkbox", { name: "Operations", exact: true }).uncheck();
  await wait(() => !store.allowedSites("alex").includes("fixture"));
  await mode("Employee"); await nav("Connections");
  assert.equal(await window.getByText("Northstar Orders · fixture", { exact: true }).count(), 0);
  await window.getByLabel("Website", { exact: true }).fill("https://example.com"); await nav("Request website");
  await window.getByText("Pending", { exact: true }).waitFor();
  await mode("Admin"); await nav("Approved websites"); await window.getByText("https://example.com", { exact: true }).waitFor();
  await website.getByRole("checkbox", { name: "Operations", exact: true }).check();
  await wait(() => store.allowedSites("alex").includes("fixture"));
  await shot("02-approvals-and-request");
  await nav("Data"); await nav("Add collection");
  const d = window.getByRole("dialog"); await d.getByLabel("Name").fill("Empty file test");
  await d.locator('input[type="file"]').setInputFiles(empty); await d.getByRole("button", { name: "Add collection", exact: true }).click();
  await d.getByText("The selected file is empty", { exact: true }).waitFor();
  await shot("03-readable-file-error"); await window.keyboard.press("Escape");
  await add("Order review data", csv); await add("Customer accounts", xlsx, "Customer success");
  await shot("04-data-collections");
  const row = (name: string) => window.locator(".collection-row").filter({ has: window.getByText(name, { exact: true }) });
  await row("Customer accounts").getByRole("button", { name: "Preview", exact: true }).click();
  await window.getByRole("dialog").getByRole("cell", { name: "A-101", exact: true }).waitFor(); await shot("05-xlsx-preview"); await window.keyboard.press("Escape");
  await row("Order review data").getByRole("button", { name: "Preview", exact: true }).click();
  await window.getByRole("dialog").getByRole("cell", { name: "NS-1042", exact: true }).waitFor(); await window.keyboard.press("Escape");
  await choose("Team for Customer accounts", "Operations"); await wait(() => store.all("collection").find(c=>c.name==="Customer accounts")?.team==="Operations");
  await window.setViewportSize({ width: 1000, height: 800 }); await shot("06-data-small-window");
  assert.ok(await window.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth + 1), "Admin data layout overflows");
  await window.setViewportSize({ width: 1320, height: 900 });
  await mode("Employee"); await nav("My agents"); await nav("Create agent");
  await window.getByLabel("Agent name").fill("Prepare team overdue report");
  await window.getByLabel("Desired outcome").fill("Filter the team collection and create a summary workbook.");
  await nav("Continue"); await nav("Write steps manually");
  await choose("Action", "spreadsheet"); await window.getByLabel("Step 1 name", { exact: true }).fill("Filter overdue orders and add summary");
  await window.getByLabel("Value / input", { exact: true }).fill("overdue");
  await choose("File / data from step", "Order review data");
  await nav("Continue");
  // Data-only workflows need no website account. Remove the suggested browser site.
  const sitesInput = window.getByLabel("Approved websites", { exact: true }).and(window.locator("input"));
  await sitesInput.focus(); await sitesInput.press("Backspace"); await sitesInput.press("Escape");
  await nav("Continue"); await nav("Run test");
  await window.getByText("Completed", { exact: true }).waitFor({ timeout: 30000 }); await shot("07-collection-agent-test");
  await nav("Continue"); await nav("Save and enable");
  await window.locator(".agent-title").filter({ hasText: "Prepare team overdue report" }).click();
  await window.getByRole("tab", { name: "Results", exact: true }).click();
  await window.getByRole("cell", { name: "NS-1042", exact: true }).waitFor();
  const [download] = await Promise.all([window.waitForEvent("download"), window.getByRole("button", { name: "CSV", exact: true }).click()]);
  const exportPath = path.join(root, "export.csv"); await download.saveAs(exportPath); assert.match(await readFile(exportPath,"utf8"), /NS-1042/);
  await shot("08-collection-agent-results");
  await window.getByRole("tab", { name: "Settings", exact: true }).click(); await nav("Share with team"); await window.getByRole("button", { name: "Stop team sharing", exact: true }).waitFor();
  await person("Jordan Lee"); await nav("Team agents"); await window.locator(".agent-title").filter({ hasText: "Prepare team overdue report" }).click();
  await window.getByRole("tab", { name: "Results", exact: true }).click(); await window.getByRole("heading", { name: "Useful work lands here" }).waitFor();
  await nav("Run agent"); await nav("Start run"); await window.getByText("Completed", { exact: true }).waitFor({ timeout: 30000 });
  await window.getByRole("tab", { name: "Results", exact: true }).click(); await window.getByRole("cell", { name: "NS-1042", exact: true }).waitFor();
  await window.getByRole("tab", { name: "Edit", exact: true }).click(); await nav("Duplicate to edit");
  await wait(()=>store.all("agent").some(a=>a.owner==="jordan" && a.name.includes("Prepare team overdue report")));
  const copy = store.all("agent").find(a=>a.owner==="jordan" && a.name.includes("Prepare team overdue report"))!;
  assert.equal(store.all("run").some(r=>r.agentId===copy.id),false);
  await person("Sam Rivera"); await nav("Team agents"); assert.equal(await window.locator(".agent-title").filter({hasText:"Prepare team overdue report"}).count(),0);
  await person("Alex Morgan"); await mode("Admin"); await nav("Data");
  await window.getByRole("button", { name: "Remove Customer accounts", exact: true }).click();
  await window.getByRole("dialog").getByRole("button", { name: "Keep collection" }).click(); assert.ok(store.all("collection").some(c=>c.name==="Customer accounts"));
  await window.getByRole("button", { name: "Remove Customer accounts", exact: true }).click(); await window.getByRole("dialog").getByRole("button", { name: "Remove collection", exact: true }).click();
  await wait(()=>!store.all("collection").some(c=>c.name==="Customer accounts"));
  assert.deepEqual(errors, []);
  await shot("09-final-admin-data");
  await writeFile(path.join(root,"result.json"),JSON.stringify({passed:true,checks:["teams","website approvals","requests","CSV/XLSX import","inline errors","preview","team assignment","data agent","exports","sharing","employee isolation","duplicate","delete confirmation","responsive layout"]},null,2));
  console.log(`PASS. Evidence: ${root}`);
} catch(error) { await shot("failure").catch(()=>{}); console.error(`Evidence: ${root}`); throw error; }
finally { const video=window.video(); await app.close(); await video?.saveAs(path.join(root,"admin-and-team-data.webm")); store.close(); }
