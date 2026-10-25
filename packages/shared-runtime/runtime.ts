import { tableFile } from "./tabular";
import { chromium, type BrowserContext, type Page } from "playwright";
import ExcelJS from "exceljs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Store } from "./store";
import { actions, sites, type Run, type Step } from "./schema";
export const toolRegistry = Object.fromEntries(
  actions.map((name) => [
    name,
    {
      name,
      input: z.object({ value: z.string().optional() }),
      output: z.unknown(),
      permissions: [name],
      connection: [
        "navigate",
        "click",
        "fill",
        "read",
        "download",
        "upload",
      ].includes(name)
        ? "browser"
        : null,
      behavior: ["click", "fill", "upload", "http"].includes(name)
        ? "write"
        : "read",
      sideEffects: ["click", "upload", "http"].includes(name),
      timeout: 15000,
      retrySafe: ["read", "wait"].includes(name),
      locations: ["local", "hosted"],
    },
  ]),
);
export function allowedURL(raw: string, catalog = sites) {
  const u = new URL(raw);
  if (u.username || u.password || !catalog.some((s) => s.origin === u.origin))
    throw Error("Website is not approved");
  return u.href;
}
export function safeFile(root: string, name: string) {
  if (!/^[\w .-]{1,160}$/.test(name) || name === "." || name === "..")
    throw Error("Unsafe filename");
  const p = path.resolve(root, name);
  if (path.dirname(p) !== path.resolve(root))
    throw Error("File outside run workspace");
  return p;
}
export function locate(page: Page, selector = "") {
  if (selector.startsWith("label="))
    return page.getByLabel(selector.slice(6), { exact: true });
  if (selector.startsWith("text="))
    return page.getByText(selector.slice(5), { exact: true });
  const role = selector.match(/^role=(\w+)\[name="(.*)"\]$/);
  if (role)
    return page.getByRole(role[1] as any, { name: role[2], exact: true });
  if (selector.startsWith("css=")) return page.locator(selector.slice(4));
  throw Error("Choose a semantic target or a css= locator");
}
export async function transformWorkbook(
  input: string,
  output: string,
  value = "overdue",
) {
  if (!input.endsWith(".xlsx"))
    throw Error(
      "Only ordinary .xlsx workbooks are supported; macros and legacy formats are not preserved",
    );
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(input);
  if (
    wb.worksheets.some(
      (s) =>
        s.getImages().length ||
        ((s.model as any).dataValidations &&
          Object.keys((s.model as any).dataValidations).length),
    )
  )
    throw Error(
      "Workbook contains unsupported images or validation rules. Use a manual step.",
    );
  const sheet = wb.worksheets[0];
  if (!sheet) throw Error("Workbook has no worksheet");
  const headers = (sheet.getRow(1).values as any[]).slice(1).map(String);
  const rows: Record<string, unknown>[] = [];
  sheet.eachRow((row, i) => {
    if (i === 1) return;
    const record: Record<string, unknown> = {};
    headers.forEach((h, j) => {
      const v = row.getCell(j + 1).value;
      if (v && typeof v === "object" && "formula" in v)
        throw Error(
          "Formula results require a calculation engine. Use a values-only report.",
        );
      record[h] = v;
    });
    if (String(record.status).toLowerCase() === value.toLowerCase())
      rows.push(record);
  });
  const out = new ExcelJS.Workbook();
  const data = out.addWorksheet("Overdue orders");
  data.addRow(headers);
  rows.forEach((r) => data.addRow(headers.map((h) => r[h] as any)));
  data.getRow(1).font = { bold: true };
  data.columns.forEach((c) => (c.width = 22));
  const summary = out.addWorksheet("Summary");
  summary.addRows([
    ["Report", "Overdue orders"],
    ["Order count", rows.length],
    ["Total amount", rows.reduce((s, r) => s + Number(r.amount || 0), 0)],
    ["Generated", new Date().toISOString()],
  ]);
  summary.columns.forEach((c) => (c.width = 28));
  await out.xlsx.writeFile(output);
  return rows;
}
export class Runtime {
  active = new Map<string, { context?: BrowserContext; cancel: boolean }>();
  paused = new Map<
    string,
    { context: BrowserContext; page?: Page; lock: string }
  >();
  locks = new Set<string>();
  constructor(
    public store: Store,
    public location = "local",
    public headless = false,
    public secrets?: { get: (id: string) => Promise<string> },
  ) {}
  async execute(id: string) {
    let run = this.store.get<Run>("run", id);
    if (
      !run ||
      !["Queued", "Waiting for runner"].includes(run.state) ||
      run.location !== this.location
    )
      return;
    const lock = `${run.owner}:${run.location}`;
    if (this.locks.has(lock) && !this.paused.has(id)) return;
    this.locks.add(lock);
    const active: { context?: BrowserContext; cancel: boolean } = {
      cancel: false,
      context: this.paused.get(id)?.context,
    };
    let page: Page | undefined = this.paused.get(id)?.page;
    this.paused.delete(id);
    this.active.set(id, active);
    const workspace = path.join(this.store.root, "files", run.owner, run.id);
    await mkdir(workspace, { recursive: true, mode: 0o700 });
    try {
      const permissions = this.store.get("permission", run.owner);
      for (const site of run.workflow.sites)
        if (!permissions?.sites.includes(site))
          throw Error("Website permission is missing");
      for (const step of run.workflow.steps)
        if (!permissions?.tools.includes(step.action))
          throw Error(`Permission required: ${step.action}`);
      const connections = run.workflow.sites.map((site) =>
        this.store.get("connection", `${run!.owner}:${run!.location}:${site}`),
      );
      if (connections.some((c) => c?.status !== "Connected"))
        throw Error(
          "Connect the required account in this execution location first.",
        );
      run.state = "Running";
      this.store.put("run", run);
      const browserNeeded = run.workflow.steps.some((s) =>
        [
          "navigate",
          "click",
          "fill",
          "read",
          "wait",
          "download",
          "upload",
          "select",
          "press",
          "tab",
        ].includes(s.action),
      );
      if (browserNeeded && !active.context) {
        const profile = path.join(
          this.store.root,
          "profiles",
          run.owner,
          run.location,
          run.workflow.sites.find(
            (id) => sites.find((s) => s.id === id)?.type === "browser",
          ) || "public",
        );
        await mkdir(profile, { recursive: true, mode: 0o700 });
        active.context = await chromium.launchPersistentContext(profile, {
          headless: this.headless,
          acceptDownloads: true,
        });
        await active.context.route("**/*", async (route) => {
          try {
            allowedURL(
              route.request().url(),
              sites.filter((s) => run!.workflow.sites.includes(s.id)),
            );
            await route.continue();
          } catch {
            await route.abort();
          }
        });
        page = active.context.pages()[0] || (await active.context.newPage());
        if (run.step > 0) {
          const previous = run.workflow.steps
            .slice(0, run.step)
            .filter((s) => s.action === "navigate")
            .at(-1);
          if (previous?.url) await page.goto(allowedURL(previous.url));
        }
      }
      for (; run.step < run.workflow.steps.length; run.step++) {
        if (
          active.cancel ||
          this.store.get<Run>("run", id)?.state === "Cancelled"
        ) {
          run.state = "Cancelled";
          break;
        }
        const s = run.workflow.steps[run.step];
        if (s.recommendation === "Unsupported with current tools")
          throw Error(`${s.title}: replace this unsupported step`);
        if (
          (s.action === "human" ||
            s.recommendation === "Review before continuing" ||
            s.recommendation === "Keep manual") &&
          run.approved !== run.step
        ) {
          run.state = "Needs input";
          run.error = s.title;
          break;
        }
        if (s.condition && !run.outputs[s.condition]) continue;
        run.inflight = run.step;
        this.store.put("run", run);
        const value = (s.value || "").replace(/\{\{(\w+)\}\}/g, (_, k) => {
          if (!(k in run!.inputs)) throw Error(`Missing input: ${k}`);
          return run!.inputs[k];
        });
        let result: unknown;
        if (s.recommendation === "Keep manual" && s.action !== "human") {
          result = {
            reviewedAt: new Date().toISOString(),
            by: run.owner,
            manual: true,
          };
        } else
          switch (s.action) {
            case "navigate":
              await page!.goto(allowedURL(s.url || value), {
                waitUntil: "domcontentloaded",
              });
              break;
            case "click":
              await locate(page!, s.locator).click({ timeout: 10000 });
              break;
            case "fill": {
              const el = locate(page!, s.locator);
              const type = await el.getAttribute("type");
              if (["password", "hidden"].includes(type || ""))
                throw Error("Credential fields must be completed manually");
              await el.fill(value, { timeout: 10000 });
              break;
            }
            case "select":
              await locate(page!, s.locator).selectOption(value);
              break;
            case "press":
              if (
                !["Enter", "Tab", "Escape", "ArrowDown", "ArrowUp"].includes(
                  value,
                )
              )
                throw Error("Unsupported key");
              await locate(page!, s.locator).press(value);
              break;
            case "wait":
              await locate(page!, s.locator).waitFor({
                state: "visible",
                timeout: 15000,
              });
              break;
            case "read": {
              const el = locate(page!, s.locator);
              await el.waitFor({ timeout: 10000 });
              const text = await el.innerText();
              try {
                result = JSON.parse(text);
              } catch {
                result = text;
              }
              break;
            }
            case "download": {
              const [download] = await Promise.all([
                page!.waitForEvent("download", { timeout: 15000 }),
                locate(page!, s.locator).click({ timeout: 10000 }),
              ]);
              if (await download.failure()) throw Error("Download failed");
              const name = `${s.id}-${download.suggestedFilename().replace(/[^\w .-]/g, "_")}`;
              const file = safeFile(workspace, name);
              await download.saveAs(file);
              result = { file: name };
              this.store.put("artifact", {
                id: randomUUID(),
                runId: id,
                owner: run.owner,
                name,
                path: file,
              });
              break;
            }
            case "spreadsheet": {
              const source = run.outputs[s.file || ""] as any;
              if (!source?.file)
                throw Error("Choose an earlier downloaded workbook");
              const options = value.startsWith("{")
                ? JSON.parse(value)
                : {
                    filter: { column: "status", equals: value || "overdue" },
                    sum: "amount",
                  };
              const name = `${s.id}-output.${options.format === "csv" ? "csv" : "xlsx"}`;
              const file = safeFile(workspace, name);
              const rows = await tableFile(
                safeFile(workspace, source.file),
                file,
                options,
              );
              result = { file: name, records: rows };
              this.store.put("artifact", {
                id: randomUUID(),
                runId: id,
                owner: run.owner,
                name,
                path: file,
              });
              break;
            }
            case "upload": {
              const source = run.outputs[s.file || ""] as any;
              if (!source?.file)
                throw Error("Choose a file produced by an earlier step");
              await locate(page!, s.locator).setInputFiles(
                safeFile(workspace, source.file),
              );
              break;
            }
            case "human":
              result = { reviewedAt: new Date().toISOString(), by: run.owner };
              break;
            case "tab": {
              const pages = active.context!.pages();
              if (value === "new") {
                page = await active.context!.newPage();
                if (s.url) await page.goto(allowedURL(s.url));
              } else {
                page = pages[Number(value) || 0];
                if (!page) throw Error("Requested tab is not open");
              }
              break;
            }
            case "http": {
              const destination = allowedURL(
                s.url || "",
                sites.filter((site) => run!.workflow.sites.includes(site.id)),
              );
              const site = sites.find(
                (site) =>
                  run!.workflow.sites.includes(site.id) &&
                  site.type === "api" &&
                  site.origin === new URL(destination).origin,
              );
              const headers: Record<string, string> = {
                "Content-Type": "application/json",
              };
              if (site?.auth) {
                if (!this.secrets)
                  throw Error("Secure credential storage is unavailable");
                const credential = await this.secrets.get(
                  `${run.owner}:${run.location}:${site.id}`,
                );
                headers[
                  site.auth === "bearer"
                    ? "Authorization"
                    : site.headerName || "X-API-Key"
                ] =
                  site.auth === "bearer" ? `Bearer ${credential}` : credential;
              }
              const response = await fetch(destination, {
                method: s.method || "GET",
                headers,
                body:
                  s.method === "POST"
                    ? JSON.stringify(JSON.parse(value || "{}"))
                    : undefined,
                redirect: "error",
                signal: AbortSignal.timeout(15000),
              });
              if (!response.ok) {
                if (site && [401, 403].includes(response.status)) {
                  const key = `${run.owner}:${run.location}:${site.id}`;
                  const c = this.store.get("connection", key);
                  if (c)
                    this.store.put("connection", {
                      ...c,
                      status: "Sign in again",
                    });
                }
                throw Error(`HTTP ${response.status}`);
              }
              result = await response.json();
              break;
            }
            case "transform": {
              const source = run.outputs[s.file || ""];
              if (!Array.isArray(source))
                throw Error("Transform requires structured records");
              result = source.filter(
                (r) =>
                  !value ||
                  JSON.stringify(r).toLowerCase().includes(value.toLowerCase()),
              );
              break;
            }
          }
        if (s.success)
          await page!
            .getByText(s.success, { exact: false })
            .waitFor({ timeout: 10000 });
        if (result !== undefined) run.outputs[s.output] = result;
        run.history.push({
          step: s.id,
          at: new Date().toISOString(),
          output: result,
        });
        delete run.inflight;
        this.store.put("run", { ...run, step: run.step + 1 });
      }
      if (run.step >= run.workflow.steps.length) {
        const rows = Object.values(run.outputs).flatMap((o: any) =>
          Array.isArray(o) ? o : o?.records || [],
        );
        this.store.results(
          run,
          rows.length
            ? rows
            : [
                {
                  report:
                    Object.entries(run.outputs)
                      .filter(([, v]) => typeof v === "string")
                      .map(([k, v]) => `${k}: ${v}`)
                      .join("\n") || "Workflow completed",
                },
              ],
          run.workflow.steps.find((s) => s.url)?.url || "",
        );
        run.state = "Completed";
        delete run.error;
      }
    } catch (e) {
      if (active.cancel) {
        run.state = "Cancelled";
      } else {
        run.state = "Needs input";
        run.error = `${run.workflow.steps[run.step]?.title || "Run"}: ${e instanceof Error ? e.message : "Execution failed"}. Check the page or edit the workflow before retrying.`;
      }
    } finally {
      delete run.inflight;
      this.store.put("run", run);
      if (run.state === "Needs input" && active.context) {
        this.paused.set(id, { context: active.context, page, lock });
      } else {
        await active.context?.close().catch(() => {});
        this.locks.delete(lock);
      }
      this.active.delete(id);
    }
  }
  async cancel(id: string) {
    const paused = this.paused.get(id);
    if (paused) {
      await paused.context.close().catch(() => {});
      this.paused.delete(id);
      this.locks.delete(paused.lock);
    }
    const a = this.active.get(id);
    if (a) {
      a.cancel = true;
      await a.context?.close().catch(() => {});
    }
  }
  async close() {
    await Promise.all(
      [...this.active.keys(), ...this.paused.keys()].map((id) =>
        this.cancel(id),
      ),
    );
  }
}
