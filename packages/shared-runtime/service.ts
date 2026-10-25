import { z } from "zod";
import { deliverWebhooks } from "./webhooks";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { mkdir, rm, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type BrowserContext } from "playwright";
import ExcelJS from "exceljs";
import { Store } from "./store";
import { Runtime, allowedURL } from "./runtime";
import {
  agentSchema,
  sites,
  requestSchema,
  type Agent,
  type Collection,
  type Run,
  type Request,
} from "./schema";
import { interpret, modelInterpret, redact } from "./recording";
import { RemoteBackend } from "./remote";
import { Models, costs, type Model } from "./models";
import { ManagedRecorder } from "./managed-recorder";
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
async function preview(file: string, name: string) {
  if (!name.endsWith(".xlsx") && !name.endsWith(".csv"))
    throw Error(
      "Preview is available for CSV and XLSX files. Download this file to open it.",
    );
  const wb = new ExcelJS.Workbook();
  if (file.endsWith(".xlsx")) await wb.xlsx.readFile(file);
  else await wb.csv.readFile(file);
  return {
    name,
    sheets: wb.worksheets.map((s) => ({
      name: s.name,
      rows:
        s
          .getRows(1, Math.min(s.rowCount, 101))
          ?.map((r) =>
            (r.values as any[])
              .slice(1)
              .map((v) => (typeof v === "object" ? JSON.stringify(v) : v)),
          ) || [],
    })),
  };
}
export class Service {
  recorder: ManagedRecorder;
  runtime: Runtime;
  remote: RemoteBackend;
  models: Models;
  logins = new Map<string, BrowserContext>();
  timer?: NodeJS.Timeout;
  pairings = new Map<string, { owner: string; expires: number }>();
  constructor(
    public store: Store,
    public location = "local",
    public secrets?: {
      set: (id: string, value: string) => Promise<void>;
      get: (id: string) => Promise<string>;
    },
  ) {
    store.seed();
    this.recorder = new ManagedRecorder(store);
    this.remote = new RemoteBackend(store, secrets);
    this.models = new Models(store, secrets);
    this.runtime = new Runtime(
      store,
      location,
      process.env.RELAY_HEADLESS === "1",
      secrets,
    );
    this.runtime.predict = (owner, id, text) =>
      this.models.predict(owner, id, text);
  }
  start() {
    this.models.recover();
    for (const r of this.store.all<Run>("run"))
      if (r.location === this.location && r.state === "Running")
        this.store.put("run", {
          ...r,
          state: "Needs input",
          error:
            "Runner restarted. Review the last step before resuming to avoid repeating a write.",
        });
    this.timer = setInterval(() => void this.tick(), 1000);
  }
  async tick() {
    void deliverWebhooks(this.store);
    void this.models.poll();
    for (const a of this.store.all<Agent>("agent")) {
      if (
        a.status === "Ready" &&
        a.intervalMinutes &&
        a.location === this.location
      ) {
        const schedule = this.store.get("schedule", a.id);
        if (!schedule || Date.now() >= schedule.next) {
          this.store.put("schedule", {
            id: a.id,
            next: Date.now() + a.intervalMinutes * 60000,
          });
          try {
            this.submit(
              a.owner,
              a.id,
              {},
              `schedule:${a.id}:${schedule?.next || 0}`,
            );
          } catch {}
        }
      }
    }
    for (const r of this.store.all<Run>("run"))
      if (
        r.location === this.location &&
        ["Queued", "Waiting for runner"].includes(r.state)
      )
        void this.runtime.execute(r.id);
  }
  readiness(owner: string, a: Agent) {
    const issues: string[] = [];
    if (
      a.workflow.sites.filter(
        (id) => sites.find((s) => s.id === id)?.type === "browser",
      ).length > 1
    )
      issues.push(
        "Use one browser account per workflow; split multi-account tasks into separate agents",
      );
    if (!a.workflow.steps.length) issues.push("Add at least one workflow step");
    const allowed = this.store.allowedSites(owner);
    for (const site of a.workflow.sites)
      if (!allowed.includes(site))
        issues.push(
          `${sites.find((s) => s.id === site)?.name || site} is not approved for your team`,
        );
    for (const s of a.workflow.steps) {
      if (s.recommendation === "Unsupported with current tools")
        issues.push(`${s.title}: choose a supported tool`);
      if (s.action === "human" && !s.assignedTo)
        issues.push(`${s.title}: assign a reviewer`);
      if (s.action === "model") {
        const m = this.store.get<Model>("model", s.model || "");
        if (
          !m ||
          m.state !== "Published" ||
          m.team !== this.store.employee(owner).team
        )
          issues.push(`${s.title}: choose a published model for your team`);
        else if (a.location !== this.location)
          issues.push(
            `${s.title}: published models are available to runs on this computer only`,
          );
      } else if (s.file?.startsWith("collection:")) {
        try {
          this.store.collection(s.file.slice(11), owner);
          if (a.location !== this.location)
            issues.push(
              `${s.title}: team data collections are available to runs on this computer only`,
            );
        } catch {
          issues.push(`${s.title}: this data collection is not available`);
        }
      } else if (
        ["upload", "spreadsheet"].includes(s.action) &&
        s.recommendation !== "Keep manual" &&
        !a.workflow.steps
          .slice(0, a.workflow.steps.indexOf(s))
          .some((p) => p.output === s.file)
      )
        issues.push(`${s.title}: select an earlier output file`);
      if (s.url) {
        try {
          allowedURL(s.url);
        } catch {
          issues.push(`${s.title}: request this website`);
        }
      }
    }
    for (const site of a.workflow.sites)
      if (
        this.store.get("connection", `${owner}:${a.location}:${site}`)
          ?.status !== "Connected" &&
        !(
          a.location === "local" &&
          this.store.get("runnerConnection", `${owner}:${site}`)?.status ===
            "Connected"
        ) &&
        !this.remote.cache
          .get(`${owner}:${a.id}`)
          ?.data.connections.some(
            (c: any) =>
              c.site === site &&
              c.location === a.location &&
              c.status === "Connected",
          )
      )
        issues.push(`Connect ${site} for ${a.location} execution`);
    if (a.workflow.output.mode === "update" && !a.workflow.output.uniqueKey)
      issues.push("Choose a unique result key");
    return issues;
  }
  submit(
    owner: string,
    agentId: string,
    inputs: Record<string, string>,
    idempotency?: string,
    test = false,
  ) {
    const a = this.store.agent(agentId, owner);
    if (["Paused", "Archived"].includes(a.status))
      throw Error("Agent is paused");
    if (a.status === "Draft" && !test)
      throw Error("Test and enable this draft before running");
    const issues = this.readiness(owner, a);
    if (issues.length) throw Error(issues.join(". "));
    for (const input of a.workflow.inputs)
      if (input.required && !inputs[input.name])
        throw Error(`Provide ${input.label}`);
    return this.store.transaction(() => {
      const key = idempotency
        ? `${owner}:${agentId}:${idempotency}`
        : undefined;
      const prior = key && this.store.get("idempotency", key);
      if (prior) return this.store.run(prior.runId, owner);
      const run: Run = {
        id: randomUUID(),
        agentId,
        owner,
        location: a.location,
        state: a.location === this.location ? "Queued" : "Waiting for runner",
        step: 0,
        inputs,
        workflow: structuredClone(a.workflow),
        version: a.version,
        created: new Date().toISOString(),
        outputs: {},
        history: [],
      };
      this.store.put("run", run);
      if (key) this.store.put("idempotency", { id: key, runId: run.id });
      return run;
    });
  }
  async request(owner: string, raw: Request): Promise<any> {
    this.store.employee(owner);
    const { method, payload: p } = requestSchema.parse(raw);
    const id = String(p.id || "");
    const backends = this.store.all("backend").filter((b) => b.owner === owner);
    if (method === "snapshot")
      await Promise.all(
        backends.map(async (b) => {
          try {
            await this.remote.metadata(owner, b.agentId);
          } catch {}
        }),
      );
    const remoteWorkspaces = backends.flatMap((b) => {
      const data = this.remote.cache.get(`${owner}:${b.agentId}`)?.data;
      return data ? [{ ...data, agentId: b.agentId }] : [];
    });
    if (["run", "results", "export"].includes(method)) {
      const a = this.store.agent(id, owner);
      if (a.location === "hosted" && this.remote.config(owner, id)) {
        if (method === "run") {
          await this.remote.call(
            owner,
            id,
            `/agents/${id}/configuration`,
            "PUT",
            { agent: a },
          );
          const result = await this.remote.call(
            owner,
            id,
            `/agents/${id}/runs`,
            "POST",
            { inputs: p.inputs || {}, test: Boolean(p.test) },
          );
          this.remote.invalidate(owner, id);
          return result;
        }
        return this.remote.call(
          owner,
          id,
          `/agents/${id}/${method === "results" ? "results" : `export?format=${p.format === "csv" ? "csv" : "xlsx"}`}`,
        );
      }
    }
    if (["cancel", "resume", "artifact"].includes(method)) {
      const workspace = remoteWorkspaces.find((w) =>
        method === "artifact"
          ? w.artifacts.some((a: any) => a.id === id)
          : w.runs.some((r: any) => r.id === id),
      );
      if (workspace) {
        const route =
          method === "artifact"
            ? `/artifacts/${id}/content${p.preview ? "?preview=1" : ""}`
            : `/runs/${id}/${method}`;
        const result = await this.remote.call(
          owner,
          workspace.agentId,
          route,
          method === "artifact" ? "GET" : "POST",
          method === "artifact" ? undefined : {},
        );
        this.remote.invalidate(owner, workspace.agentId);
        return result;
      }
    }
    switch (method) {
      case "startRecording":
        return this.recorder.start(owner, z.string().parse(p.agentId));
      case "recordingControl":
        return this.recorder.control(
          owner,
          z
            .enum(["pause", "resume", "finish", "cancel", "reviewed"])
            .parse(p.action),
          p.confirm === true,
        );
      case "backend": {
        this.store.agent(id, owner, true);
        if (!this.secrets) throw Error("Secure token storage unavailable");
        const endpoint = new URL(String(p.endpoint));
        if (
          endpoint.username ||
          endpoint.password ||
          (endpoint.protocol !== "https:" &&
            !["127.0.0.1", "localhost"].includes(endpoint.hostname))
        )
          throw Error(
            "Backend requires HTTPS (loopback allowed for development)",
          );
        await this.secrets.set(
          `backend:${owner}:${id}`,
          z.string().min(20).parse(p.token),
        );
        const config = {
          id: `${owner}:${id}`,
          owner,
          agentId: id,
          endpoint: endpoint.href.replace(/\/$/, ""),
        };
        this.store.put("backend", config);
        try {
          await this.remote.metadata(owner, id);
        } catch (e) {
          this.store.delete("backend", config.id);
          throw e;
        }
        return true;
      }
      case "snapshot": {
        const employee = this.store.employee(owner);
        return {
          employee,
          employees: this.store.employees(),
          recordingSession: this.recorder.state(owner),
          signingSites: [...this.logins.keys()].filter(key => key.startsWith(owner + ":")),
          sites,
          allowedSites: this.store.allowedSites(owner),
          collections: this.store
            .all<Collection>("collection")
            .filter((c) => c.team === employee.team)
            .map(({ path, ...c }) => c),
          models: this.store
            .all<Model>("model")
            .filter((m) => m.state === "Published" && m.team === employee.team)
            .map(({ id, name, labels, textColumn, labelColumn }) => ({
              id,
              name,
              labels,
              textColumn,
              labelColumn,
            })),
          agents: this.store
            .all<Agent>("agent")
            .filter(
              (a) =>
                a.owner === owner || (a.shared && a.team === employee.team),
            ),
          runs: [
            ...this.store.all<Run>("run").filter((r) => r.owner === owner),
            ...remoteWorkspaces.flatMap((w) => w.runs),
          ],
          connections: [
            ...this.store.all("connection").filter((c) => c.owner === owner),
            ...remoteWorkspaces.flatMap((w) => w.connections),
          ],
          requests: this.store
            .all("websiteRequest")
            .filter((r) => r.owner === owner),
          artifacts: [
            ...this.store
              .all("artifact")
              .filter((r) => r.owner === owner)
              .map(({ path, ...a }) => a),
            ...remoteWorkspaces.flatMap((w) => w.artifacts),
          ],
          backends: backends.map(({ endpoint, agentId }) => ({
            endpoint,
            agentId,
          })),
          tokens: this.store
            .all("token")
            .filter((t) => t.owner === owner)
            .map(({ digest, ...t }) => t),
          settings: this.store.get("settings", owner) || {},
          recordings: this.store
            .all("recording")
            .filter((r) => r.owner === owner),
          readiness: Object.fromEntries(
            this.store
              .all<Agent>("agent")
              .filter(
                (a) =>
                  a.owner === owner || (a.shared && a.team === employee.team),
              )
              .map((a) => [a.id, this.readiness(owner, a)]),
          ),
        };
      }
      case "saveAgent": {
        const parsed = agentSchema.parse(p);
        const old = parsed.id
          ? this.store.agent(parsed.id, owner, true)
          : undefined;
        const a: Agent = {
          ...parsed,
          id: old?.id || randomUUID(),
          owner,
          team: this.store.employee(owner).team,
          version: (old?.version || 0) + 1,
        };
        if (a.status === "Ready") {
          const issues = this.readiness(owner, a);
          if (issues.length) throw Error(issues.join(". "));
          if (
            !p.untested &&
            ![
              ...this.store.all<Run>("run"),
              ...(this.remote.cache.get(`${owner}:${a.id}`)?.data.runs || []),
            ].some(
              (r) =>
                r.agentId === a.id &&
                r.owner === owner &&
                r.state === "Completed" &&
                JSON.stringify(r.workflow) === JSON.stringify(a.workflow),
            )
          )
            throw Error(
              "Complete a test or explicitly enable without a successful test",
            );
        }
        this.store.put("version", { id: `${a.id}:${a.version}`, agent: a });
        this.store.put("agent", a);
        if (a.location === "hosted" && this.remote.config(owner, a.id)) {
          await this.remote.call(
            owner,
            a.id,
            `/agents/${a.id}/configuration`,
            "PUT",
            { agent: a },
          );
          this.remote.invalidate(owner, a.id);
        }
        return a;
      }
      case "deleteAgent":
        this.store.agent(id, owner, true);
        this.store.delete("agent", id);
        return true;
      case "duplicate": {
        const a = this.store.agent(id, owner);
        return this.store.put("agent", {
          ...a,
          id: randomUUID(),
          owner,
          team: this.store.employee(owner).team,
          name: `${a.name} copy`,
          shared: false,
          status: "Draft",
          version: 1,
          intervalMinutes: null,
        });
      }
      case "run":
        return this.submit(
          owner,
          id,
          z.record(z.string(), z.string().max(10000)).parse(p.inputs || {}),
          undefined,
          Boolean(p.test),
        );
      case "cancel": {
        const r = this.store.run(id, owner);
        if (["Completed", "Failed", "Cancelled"].includes(r.state))
          throw Error("Run has ended");
        this.store.put("run", { ...r, state: "Cancelled" });
        await this.runtime.cancel(id);
        return true;
      }
      case "resume": {
        const r = this.store.run(id, owner);
        if (r.state !== "Needs input")
          throw Error("Run is not waiting for input");
        if (this.runtime.active.has(id))
          throw Error("Wait for the browser to finish closing");
        return this.store.put("run", {
          ...r,
          approved: r.step,
          state: r.location === this.location ? "Queued" : "Waiting for runner",
          error: undefined,
        });
      }
      case "connect": {
        const site = sites.find((s) => s.id === p.site);
        if (!site) throw Error("Website is not approved");
        if (!this.store.allowedSites(owner).includes(site.id))
          throw Error("Your admin has not approved this website for your team");
        const location = String(p.location || "local");
        if (location !== this.location)
          throw Error(
            "Open connection setup on the hosted worker to sign in there. Local profiles are never uploaded.",
          );
        const key = `${owner}:${location}:${site.id}`;
        if (site.type === "api") {
          if (!this.secrets)
            throw Error("Secure credential storage is unavailable");
          const credential = z.string().min(1).max(10000).parse(p.credential);
          if (site.verifyPath) {
            const headers: Record<string, string> = {};
            headers[
              site.auth === "bearer"
                ? "Authorization"
                : site.headerName || "X-API-Key"
            ] = site.auth === "bearer" ? `Bearer ${credential}` : credential;
            const response = await fetch(
              allowedURL(site.origin + site.verifyPath),
              {
                headers,
                redirect: "error",
                signal: AbortSignal.timeout(10000),
              },
            );
            if (!response.ok)
              throw Error(
                `Connection verification failed (${response.status})`,
              );
          }
          await this.secrets.set(key, credential);
          return this.store.put("connection", {
            id: key,
            owner,
            site: site.id,
            location,
            status: "Connected",
            account: site.verifyPath
              ? "Verified API account"
              : "Configured API credential",
          });
        }
        if (this.runtime.locks.has(`${owner}:${location}`))
          throw Error("Wait for the current run to finish");
        if (this.logins.has(key)) return true;
        const profile = path.join(
          this.store.root,
          "profiles",
          owner,
          location,
          site.id,
        );
        await mkdir(profile, { recursive: true, mode: 0o700 });
        this.runtime.locks.add(`${owner}:${location}`);
        try {
          const context = await chromium.launchPersistentContext(profile, {
            headless: false,
            ...(process.env.RELAY_TEST_CAPTURE === "1" ? { args: ["--remote-debugging-port=0", "--remote-debugging-address=127.0.0.1"] } : {}),
          });
          this.logins.set(key, context);
          context.on("close", () => {
            if (this.logins.get(key) === context) {
              this.logins.delete(key);
              this.runtime.locks.delete(`${owner}:${location}`);
            }
          });
          await context.pages()[0].goto(site.origin + site.login);
          return true;
        } catch (e) {
          await this.logins.get(key)?.close().catch(() => {});
          this.logins.delete(key);
          this.runtime.locks.delete(`${owner}:${location}`);
          throw e;
        }
      }
      case "deactivate": {
        await this.recorder.close(owner);
        for (const run of this.store
          .all<Run>("run")
          .filter((r) => r.owner === owner)) {
          if (this.runtime.active.has(run.id))
            this.store.put("run", {
              ...run,
              state: "Cancelled",
              error: "Stopped when switching demo employees.",
            });
          await this.runtime.cancel(run.id);
        }
        for (const [key, context] of this.logins) {
          if (key.startsWith(owner + ":")) {
            await context.close();
            this.logins.delete(key);
            this.runtime.locks.delete(`${owner}:${this.location}`);
          }
        }
        return true;
      }
      case "finishConnect": {
        const key = `${owner}:${this.location}:${p.site}`;
        const context = this.logins.get(key);
        if (!context) throw Error("Start sign-in first");
        const cookies = await context.cookies();
        const approved = sites.find((s) => s.id === p.site);
        if (
          approved?.sessionCookie &&
          !cookies.some((c) => c.name === approved.sessionCookie)
        )
          throw Error("Finish signing in in the browser first");
        await context.close();
        this.logins.delete(key);
        this.runtime.locks.delete(`${owner}:${this.location}`);
        return this.store.put("connection", {
          id: key,
          owner,
          site: p.site,
          location: this.location,
          status: "Connected",
          account: "Signed-in browser account",
        });
      }
      case "disconnect": {
        const key = `${owner}:${p.location || "local"}:${p.site}`;
        const c = this.store.get("connection", key);
        if (!c || c.owner !== owner) throw Error("Connection not found");
        if (this.runtime.locks.has(`${owner}:${c.location}`))
          throw Error("Stop active runs before disconnecting");
        this.store.delete("connection", key);
        if (sites.find((s) => s.id === c.site)?.type === "api" && this.secrets)
          await this.secrets.set(key, "");
        await rm(
          path.join(this.store.root, "profiles", owner, c.location, c.site),
          { recursive: true, force: true },
        );
        return true;
      }
      case "requestSite": {
        const u = new URL(String(p.url));
        if (u.protocol !== "https:") throw Error("Enter an HTTPS website");
        return this.store.put("websiteRequest", {
          id: randomUUID(),
          owner,
          origin: u.origin,
          status: "Pending",
        });
      }
      case "results":
        this.store.agent(id, owner);
        return {
          rows: this.store
            .all("result")
            .filter((r) => r.owner === owner && r.agentId === id),
          history: this.store
            .all("resultHistory")
            .filter((r) => r.owner === owner && r.agentId === id),
        };
      case "artifact": {
        const a = this.store.get("artifact", id);
        if (!a || a.owner !== owner) throw Error("File not available");
        if (p.preview) return preview(a.path, a.name);
        const data = await readFile(a.path);
        return { name: a.name, base64: data.toString("base64") };
      }
      case "collection": {
        const c =
          this.store.employee(owner).role === "admin"
            ? this.store.get<Collection>("collection", id)
            : this.store.collection(id, owner);
        if (!c) throw Error("Data collection not found");
        return preview(c.path, c.fileName);
      }
      case "admin": {
        this.admin(owner);
        return {
          teams: this.store.all("team").map((t) => ({
            ...t,
            sites: t.sites || sites.map((s) => s.id),
          })),
          agents: this.store.all<Agent>("agent").map((a) => ({
            id: a.id,
            name: a.name,
            description: a.description,
            owner: a.owner,
            team: a.team,
            status: a.status,
            shared: a.shared,
            location: a.location,
            sites: a.workflow.sites,
            steps: a.workflow.steps.length,
          })),
          collections: this.store
            .all<Collection>("collection")
            .map(({ path, ...c }) => c),
          requests: this.store.all("websiteRequest"),
          models: this.store.all<Model>("model"),
          provider: this.models.provider(),
          costs: await costs(),
        };
      }
      case "connectProvider":
        this.admin(owner);
        return this.models.connect(
          owner,
          z.string().min(8).max(500).parse(p.token),
          p.namespace ? String(p.namespace) : undefined,
        );
      case "disconnectProvider":
        this.admin(owner);
        return this.models.disconnect();
      case "modelPlan":
        this.admin(owner);
        return this.models.plan(p);
      case "trainModel":
        this.admin(owner);
        return this.models.train(owner, p);
      case "cancelModel":
        this.admin(owner);
        return this.models.cancel(id);
      case "publishModel":
        this.admin(owner);
        return this.models.publish(owner, id, p);
      case "unpublishModel":
        this.admin(owner);
        return this.models.unpublish(id);
      case "predict":
        return this.models.predict(owner, id, p.text);
      case "setTeamSites": {
        this.admin(owner);
        const team = this.store.get("team", String(p.team));
        if (!team) throw Error("Team not found");
        const ids = sites.map((s) => s.id) as [string, ...string[]];
        return this.store.put("team", {
          ...team,
          sites: z.array(z.enum(ids)).parse(p.sites),
        });
      }
      case "moveMember": {
        this.admin(owner);
        const member = this.store.employee(id);
        const team = this.store.get("team", String(p.team));
        if (!team) throw Error("Team not found");
        return this.store.transaction(() => {
          for (const a of this.store
            .all<Agent>("agent")
            .filter((a) => a.owner === member.id))
            this.store.put("agent", { ...a, team: team.id });
          return this.store.put("employee", { ...member, team: team.id });
        });
      }
      case "addCollection": {
        this.admin(owner);
        if (!this.store.get("team", String(p.team)))
          throw Error("Choose a team");
        const fileName = String(p.fileName || "")
          .replace(/[^\w .-]/g, "_")
          .replace(/\.(csv|xlsx)$/i, (ext) => ext.toLowerCase())
          .slice(-120);
        if (!/\.(csv|xlsx)$/.test(fileName))
          throw Error("Choose a .csv or .xlsx file");
        const bytes = Buffer.from(String(p.base64 || ""), "base64");
        if (!bytes.length) throw Error("The selected file is empty");
        if (bytes.length > 10_000_000) throw Error("Files must be under 10 MB");
        const collectionId = randomUUID();
        const dir = path.join(this.store.root, "collections", collectionId);
        await mkdir(dir, { recursive: true, mode: 0o700 });
        const file = path.join(dir, fileName);
        await writeFile(file, bytes, { mode: 0o600 });
        const wb = new ExcelJS.Workbook();
        try {
          if (fileName.endsWith(".xlsx")) await wb.xlsx.readFile(file);
          else await wb.csv.readFile(file);
          if (!wb.worksheets[0]) throw Error();
        } catch {
          await rm(dir, { recursive: true, force: true });
          throw Error("Relay could not read this file as a table");
        }
        const sheet = wb.worksheets[0];
        const { path: _, ...c } = this.store.put("collection", {
          id: collectionId,
          name: z.string().trim().min(1).max(100).parse(p.name),
          description: z
            .string()
            .max(500)
            .parse(p.description || ""),
          team: String(p.team),
          fileName,
          path: file,
          size: bytes.length,
          columns: (sheet.getRow(1).values as any[])
            .slice(1)
            .map((v) => String(v ?? "")),
          rows: Math.max(sheet.actualRowCount - 1, 0),
          addedBy: owner,
          created: new Date().toISOString(),
        } satisfies Collection);
        return c;
      }
      case "updateCollection": {
        this.admin(owner);
        const c = this.store.get<Collection>("collection", id);
        if (!c) throw Error("Data collection not found");
        if (!this.store.get("team", String(p.team)))
          throw Error("Team not found");
        this.store.put("collection", { ...c, team: String(p.team) });
        return true;
      }
      case "removeCollection": {
        this.admin(owner);
        const c = this.store.get<Collection>("collection", id);
        if (!c) throw Error("Data collection not found");
        this.store.delete("collection", id);
        await rm(path.dirname(c.path), { recursive: true, force: true });
        return true;
      }
      case "pair": {
        const code = randomBytes(16).toString("hex");
        this.pairings.set(code, { owner, expires: Date.now() + 300000 });
        return { code, expiresIn: 300, endpoint: "http://127.0.0.1:4319" };
      }
      case "recordings":
        return this.store.all("recording").filter((r) => r.owner === owner);
      case "interpret": {
        const events = redact(p.events as any[]);
        this.store.put("recording", {
          id: randomUUID(),
          owner,
          events,
          created: new Date().toISOString(),
        });
        if (p.ai) {
          const config = this.store.get("settings", owner);
          if (!config?.model || !this.secrets)
            throw Error("Configure a model provider in application settings");
          return modelInterpret(events, {
            ...config,
            key: await this.secrets.get(`${owner}:model`),
          });
        }
        return interpret(events);
      }
      case "settings": {
        const endpoint = new URL(String(p.endpoint));
        if (
          endpoint.protocol !== "https:" &&
          !["127.0.0.1", "localhost"].includes(endpoint.hostname)
        )
          throw Error("Use an HTTPS provider endpoint");
        if (p.key) {
          if (!this.secrets)
            throw Error("Secure secret storage is unavailable");
          await this.secrets.set(`${owner}:model`, String(p.key));
        }
        return this.store.put("settings", {
          id: owner,
          endpoint: endpoint.href,
          model: String(p.model),
        });
      }
      case "token": {
        if (p.modelId) this.models.access(owner, String(p.modelId));
        else this.store.agent(String(p.agentId), owner, true);
        const secret = randomBytes(32).toString("base64url");
        this.store.put("token", {
          id: randomUUID(),
          owner,
          ...(p.modelId ? { modelId: p.modelId } : { agentId: p.agentId }),
          name: String(p.name || "Integration"),
          digest: hash(secret),
          created: new Date().toISOString(),
        });
        return { token: secret };
      }
      case "revokeToken": {
        const t = this.store.get("token", id);
        if (t?.owner !== owner) throw Error("Token unavailable");
        this.store.delete("token", id);
        return true;
      }
      case "export": {
        this.store.agent(id, owner);
        const rows = this.store
          .all("result")
          .filter((r) => r.owner === owner && r.agentId === id)
          .map((r) => ({
            ...r.data,
            source: r.source,
            collectedAt: r.collectedAt,
            runId: r.runId,
          }));
        const wb = new ExcelJS.Workbook();
        const sheet = wb.addWorksheet("Results");
        const keys = [...new Set(rows.flatMap(Object.keys))];
        sheet.addRow(keys);
        rows.forEach((r) =>
          sheet.addRow(
            keys.map((k) =>
              typeof r[k] === "object" ? JSON.stringify(r[k]) : r[k],
            ),
          ),
        );
        const data =
          p.format === "csv"
            ? await wb.csv.writeBuffer()
            : await wb.xlsx.writeBuffer();
        return {
          name: `results.${p.format === "csv" ? "csv" : "xlsx"}`,
          base64: Buffer.from(data).toString("base64"),
        };
      }
    }
  }
  admin(owner: string) {
    if (this.store.employee(owner).role !== "admin")
      throw Error("Admin access required");
  }
  async close() {
    await this.recorder.close();
    if (this.timer) clearInterval(this.timer);
    await this.runtime.close();
    await Promise.all([...this.logins.values()].map((c) => c.close()));
  }
}
