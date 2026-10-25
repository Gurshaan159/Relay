import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import {
  employees,
  sites,
  workflowSchema,
  type Agent,
  type Collection,
  type Employee,
  type Run,
  type ResultRow,
} from "./schema";
export const dataDirectory = () =>
  process.env.RELAY_DATA_DIR ||
  path.join(
    process.platform === "win32"
      ? process.env.APPDATA || os.homedir()
      : process.platform === "darwin"
        ? path.join(os.homedir(), "Library", "Application Support")
        : process.env.XDG_DATA_HOME ||
          path.join(os.homedir(), ".local", "share"),
    "Relay",
  );
export class Store {
  db: DatabaseSync;
  constructor(public root = dataDirectory()) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path.join(root, "relay.sqlite"));
    this.db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL,id TEXT NOT NULL,body TEXT NOT NULL, PRIMARY KEY(kind,id));",
    );
    try {
      chmodSync(path.join(root, "relay.sqlite"), 0o600);
    } catch {}
  }
  all<T = any>(kind: string): T[] {
    return this.db
      .prepare("SELECT body FROM records WHERE kind=?")
      .all(kind)
      .map((r: any) => JSON.parse(r.body));
  }
  get<T = any>(kind: string, id: string): T | undefined {
    const r = this.db
      .prepare("SELECT body FROM records WHERE kind=? AND id=?")
      .get(kind, id) as any;
    return r ? JSON.parse(r.body) : undefined;
  }
  put(kind: string, item: { id: string; [key: string]: any }) {
    this.db
      .prepare(
        "INSERT INTO records VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET body=excluded.body",
      )
      .run(kind, item.id, JSON.stringify(item));
    return item;
  }
  delete(kind: string, id: string) {
    this.db.prepare("DELETE FROM records WHERE kind=? AND id=?").run(kind, id);
  }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  employee(id: string): Employee {
    const e = employees.find((e) => e.id === id);
    if (!e) throw Error("Unknown demo employee");
    return { ...e, ...this.get("employee", id) };
  }
  employees() {
    return employees.map((e) => this.employee(e.id));
  }
  allowedSites(owner: string) {
    const permitted = this.get("permission", owner)?.sites || [];
    const team = this.get("team", this.employee(owner).team);
    return permitted.filter(
      (id: string) => !team?.sites || team.sites.includes(id),
    ) as string[];
  }
  collection(id: string, owner: string): Collection {
    const c = this.get<Collection>("collection", id);
    if (!c || c.team !== this.employee(owner).team)
      throw Error("Data collection not available to your team");
    return c;
  }
  agent(id: string, owner: string, edit = false): Agent {
    const a = this.get<Agent>("agent", id);
    const e = this.employee(owner);
    if (!a || (a.owner !== owner && (edit || !a.shared || a.team !== e.team)))
      throw Error("Agent not available");
    return a;
  }
  run(id: string, owner: string): Run {
    const r = this.get<Run>("run", id);
    if (!r || r.owner !== owner) throw Error("Run not available");
    return r;
  }
  seed() {
    if (this.get("meta", "seed")) {
      // Data directories seeded before model steps existed get the tool once.
      if (!this.get("meta", "model-tool")) {
        for (const p of this.all("permission"))
          if (!p.tools.includes("model"))
            this.put("permission", { ...p, tools: [...p.tools, "model"] });
        this.put("meta", { id: "model-tool", at: new Date().toISOString() });
      }
      return;
    }
    employees.forEach((e) => this.put("employee", e));
    this.put("company", { id: "northstar", name: "Northstar Supply (demo)" });
    for (const team of ["Operations", "Customer success"])
      this.put("team", { id: team, name: team });
    for (const e of employees)
      this.put("permission", {
        id: e.id,
        tools: [
          "navigate",
          "click",
          "fill",
          "select",
          "press",
          "read",
          "wait",
          "download",
          "upload",
          "spreadsheet",
          "human",
          "http",
          "transform",
          "tab",
          "model",
        ],
        sites: sites.map((s) => s.id),
      });
    const workflow = workflowSchema.parse({
      steps: [
        {
          id: "open",
          title: "Open the orders report",
          action: "navigate",
          url: "http://127.0.0.1:4318/orders",
        },
        {
          id: "download",
          title: "Download the spreadsheet",
          action: "download",
          locator: 'role=link[name="Download report"]',
          output: "report",
        },
        {
          id: "filter",
          title: "Filter overdue orders and add a summary",
          action: "spreadsheet",
          file: "report",
          value: "overdue",
          output: "overdue",
        },
        {
          id: "review",
          title: "Review the report before uploading",
          action: "human",
          assignedTo: "runner",
          recommendation: "Review before continuing",
          reason: "Uploading changes the shared order report.",
        },
        {
          id: "upload",
          title: "Upload the prepared report",
          action: "upload",
          locator: "label=Upload report",
          file: "overdue",
        },
        {
          id: "submit",
          title: "Submit report",
          action: "click",
          locator: 'role=button[name="Submit report"]',
        },
        {
          id: "confirm",
          title: "Collect confirmation",
          action: "read",
          locator: "css=#confirmation",
          output: "confirmation",
        },
      ],
      expectedOutputs: ["Overdue orders workbook", "Upload confirmation"],
      output: { format: "files", mode: "dated", uniqueKey: "id" },
    });
    this.put("agent", {
      id: "orders",
      owner: "alex",
      team: "Operations",
      name: "Overdue orders",
      description: "Prepare an overdue report, review it, and send it back.",
      status: "Draft",
      shared: false,
      location: "local",
      version: 1,
      intervalMinutes: null,
      wizardStage: 5,
      workflow,
    });
    this.put("agent", {
      id: "team-records",
      owner: "jordan",
      team: "Operations",
      name: "Find order records",
      description: "Collect the latest orders from the fixture workspace.",
      status: "Ready",
      shared: true,
      location: "local",
      version: 1,
      intervalMinutes: null,
      wizardStage: 5,
      workflow: workflowSchema.parse({
        steps: [
          {
            id: "open",
            title: "Open orders",
            action: "navigate",
            url: "http://127.0.0.1:4318/orders",
          },
          {
            id: "read",
            title: "Collect order records",
            action: "read",
            locator: "css=#records",
            output: "orders",
          },
        ],
      }),
    });
    this.put("meta", { id: "seed", at: new Date().toISOString() });
    this.put("meta", { id: "model-tool", at: new Date().toISOString() });
  }
  results(run: Run, rows: Record<string, unknown>[], source: string) {
    this.transaction(() => {
      const spec = run.workflow.output;
      for (let index = 0; index < rows.length; index++) {
        const data = rows[index];
        const id =
          spec.mode === "update"
            ? `${run.owner}:${run.agentId}:${String(
                data[spec.uniqueKey] ??
                  (() => {
                    throw Error("Output is missing unique key");
                  })(),
              )}`
            : `${run.id}:${index}`;
        const old = this.get<ResultRow>("result", id);
        if (old && old.runId !== run.id)
          this.put("resultHistory", { ...old, id: randomUUID() });
        this.put("result", {
          id,
          owner: run.owner,
          agentId: run.agentId,
          runId: run.id,
          collectedAt: new Date().toISOString(),
          source,
          data,
        });
      }
    });
  }
  close() {
    this.db.close();
  }
}
