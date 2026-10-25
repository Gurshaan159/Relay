import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type Server } from "node:http";
import path from "node:path";
import { mkdir, rm } from "node:fs/promises";
import { chromium, type BrowserContext } from "playwright";
import { Store } from "./store";
import { sites } from "./schema";
import { redact, interpret } from "./recording";

export class ManagedRecorder {
  private active?: {
    owner: string;
    id: string;
    context?: BrowserContext;
    launch?: Promise<BrowserContext>;
    server: Server;
    profile: string;
    closing?: boolean;
  };
  onFinished?: () => void;
  constructor(private store: Store) {
    for (const s of store.all("recordingSession")) {
      if (["starting", "recording", "paused"].includes(s.status))
        store.put("recordingSession", {
          ...s,
          status: "interrupted",
          error:
            "Recording stopped when Relay closed. Review the saved actions or retry.",
        });
    }
  }
  state(owner: string) {
    return (
      this.store
        .all("recordingSession")
        .filter((s) => s.owner === owner)
        .sort((a, b) => a.created.localeCompare(b.created))
        .at(-1) || null
    );
  }
  async start(owner: string, agentId: string) {
    const agent = this.store.agent(agentId, owner, true);
    if (
      this.active &&
      ["finished", "cancelled", "error", "interrupted"].includes(
        this.store.get("recordingSession", this.active.id)?.status,
      )
    )
      await this.cleanup();
    if (this.active)
      throw Error("Finish or cancel the current recording first.");
    const permitted = this.store.allowedSites(owner);
    const approved = sites.filter(
      (s) => s.type === "browser" && permitted.includes(s.id),
    );
    if (!approved.length)
      throw Error("Connect an approved website before recording.");
    const id = randomUUID(),
      token = randomBytes(32).toString("hex");
    const profile = path.join(this.store.root, "recording-profiles", owner, id);
    const session = {
      id,
      owner,
      agentId,
      status: "starting",
      count: 0,
      events: [] as any[],
      created: new Date().toISOString(),
    };
    this.store.put("recordingSession", session);
    const server = createServer(async (req, res) => {
      const supplied = Buffer.from(req.headers.authorization || "");
      const expected = Buffer.from(`Bearer ${token}`);
      if (
        req.method !== "POST" ||
        req.url !== "/session" ||
        supplied.length !== expected.length ||
        !timingSafeEqual(supplied, expected)
      ) {
        res.writeHead(401).end();
        return;
      }
      try {
        let raw = "";
        for await (const chunk of req) {
          raw += chunk;
          if (raw.length > 32768) throw Error("Request too large");
        }
        const body = JSON.parse(raw);
        if (body.type === "event") {
          const s = this.store.get("recordingSession", id)!;
          const e = body.event;
          if (
            s.status === "recording" &&
            s.events.length < 100 &&
            e &&
            approved.some((site) => site.origin === new URL(e.url).origin)
          ) {
            const safe = redact([e]);
            if (safe.length) {
              s.events.push(safe[0]);
              s.count = s.events.length;
              if (s.count === 100) {
                s.status = "paused";
                s.error =
                  "This demonstration reached 100 actions. Finish and review it, then record the remaining work separately.";
              }
              this.store.put("recordingSession", s);
            }
          }
        } else if (body.type !== "state")
          await this.control(owner, body.type, body.confirm === true);
        const s = this.store.get("recordingSession", id);
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            status: s?.status || "cancelled",
            count: s?.count || 0,
          }),
        );
      } catch {
        res
          .writeHead(400)
          .end(
            JSON.stringify({ error: "Recording action could not be saved" }),
          );
      }
    });
    server.requestTimeout = 5000;
    this.active = { owner, id, server, profile };
    const active = this.active;
    try {
      await mkdir(profile, { recursive: true, mode: 0o700 });
      if (active.closing) throw Error("Recording cancelled");
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
      });
      const port = (server.address() as any).port;
      const extension =
        process.env.RELAY_MANAGED_RECORDER ||
        path.resolve("packages/recorder-extension/managed");
      if (active.closing) throw Error("Recording cancelled");
      active.launch = chromium.launchPersistentContext(profile, {
        channel: "chromium",
        headless: process.env.RELAY_HEADLESS === "1",
        viewport: null,
        args: [
          `--disable-extensions-except=${extension}`,
          `--load-extension=${extension}`,
          ...(process.env.RELAY_TEST_CAPTURE === "1"
            ? [
                "--remote-debugging-port=0",
                "--remote-debugging-address=127.0.0.1",
              ]
            : []),
        ],
        ...(process.env.RELAY_TEST_CAPTURE === "1"
          ? {
              recordVideo: {
                dir: path.join(this.store.root, "videos"),
                size: { width: 1280, height: 900 },
              },
            }
          : {}),
      });
      const context = await active.launch;
      if (active.closing) {
        await context.close();
        throw Error("Recording cancelled");
      }
      active.context = context;
      const worker =
        context.serviceWorkers()[0] ||
        (await context.waitForEvent("serviceworker", { timeout: 15000 }));
      await worker.evaluate(
        async (session) => {
          await (globalThis as any).chrome.storage.local.set({ session });
        },
        {
          endpoint: `http://127.0.0.1:${port}/session`,
          token,
          origins: approved.map((s) => s.origin),
        },
      );
      if (active.closing) throw Error("Recording cancelled");
      this.store.put("recordingSession", { ...session, status: "recording" });
      context.on("close", () => {
        if (!this.active?.closing && this.active?.id === id) {
          const s = this.store.get("recordingSession", id)!;
          this.store.put("recordingSession", {
            ...s,
            status: "interrupted",
            error:
              "The recording browser closed. Review the saved actions or retry.",
          });
          void this.cleanup();
        }
      });
      const site =
        approved.find((s) => agent.workflow.sites.includes(s.id)) ||
        approved[0];
      await (context.pages()[0] || (await context.newPage())).goto(
        new URL(site.login, site.origin).href,
        { waitUntil: "domcontentloaded", timeout: 30000 },
      );
      return this.state(owner);
    } catch (error) {
      if (active.closing) return this.state(owner);
      const s = this.store.get("recordingSession", id)!;
      const message = String(error).includes("Executable doesn't exist")
        ? "The recording browser isn’t installed. Run Relay’s browser setup, then retry."
        : "Couldn’t open the recording browser. Check that the website is available, then retry.";
      this.store.put("recordingSession", {
        ...s,
        status: "error",
        error: message,
      });
      if (this.active === active) await this.cleanup();
      return this.state(owner);
    }
  }
  async control(owner: string, action: string, confirmed = false) {
    const s = this.state(owner);
    if (!s || (this.active && this.active.owner !== owner))
      throw Error("Recording unavailable");
    if (action === "reviewed") {
      if (s.status !== "finished")
        throw Error("Finish recording before review");
      const agent = this.store.agent(s.agentId, owner, true);
      this.store.put("agent", {
        ...agent,
        workflow: { ...agent.workflow, steps: s.workflow.steps },
        wizardStage: 2,
        status: "Draft",
        version: agent.version + 1,
      });
      this.store.put("recordingSession", { ...s, status: "reviewed" });
    } else if (action === "finish") {
      if (!["recording", "paused", "interrupted", "error"].includes(s.status))
        throw Error("Recording has already ended");
      const workflow = interpret(s.events);
      this.store.put("recording", {
        id: s.id,
        owner,
        agentId: s.agentId,
        created: s.created,
        events: s.events,
      });
      this.store.put("recordingSession", {
        ...s,
        status: "finished",
        workflow,
      });
      this.onFinished?.();
      setTimeout(() => {
        if (this.active?.id === s.id) void this.cleanup();
      }, 150);
    } else if (action === "cancel") {
      if (s.count && !confirmed)
        throw Error("Confirm discarding the recorded actions");
      this.store.put("recordingSession", {
        id: s.id,
        owner,
        agentId: s.agentId,
        created: s.created,
        status: "cancelled",
        count: 0,
        events: [],
      });
      setTimeout(() => {
        if (this.active?.id === s.id) void this.cleanup();
      }, 150);
    } else if (["pause", "resume"].includes(action)) {
      if (!["recording", "paused"].includes(s.status))
        throw Error("Start a new recording to continue");
      this.store.put("recordingSession", {
        ...s,
        status: action === "pause" ? "paused" : "recording",
      });
    } else throw Error("Unknown recording action");
    return this.state(owner);
  }
  async cleanup() {
    const active = this.active;
    if (!active) return;
    active.closing = true;
    if (active.launch)
      await active.launch.then((c) => c.close()).catch(() => {});
    await active.context?.close().catch(() => {});
    active.server.closeAllConnections();
    active.server.close();
    await rm(active.profile, { recursive: true, force: true }).catch(() => {});
    if (this.active === active) this.active = undefined;
  }
  async close(owner?: string) {
    if (!this.active || (owner && this.active.owner !== owner)) return;
    const s = this.store.get("recordingSession", this.active.id)!;
    if (["recording", "paused", "starting"].includes(s.status))
      this.store.put("recordingSession", {
        ...s,
        status: "interrupted",
        error: "Recording stopped. Review the saved actions or retry.",
      });
    await this.cleanup();
  }
}
