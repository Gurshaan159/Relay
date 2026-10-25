import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Store } from "../packages/shared-runtime/store";
import { Service } from "../packages/shared-runtime/service";
import { serve } from "../packages/server/http";
import { workflowSchema } from "../packages/shared-runtime/schema";
import { deliverWebhooks } from "../packages/shared-runtime/webhooks";
import http from "node:http";
import { createHmac } from "node:crypto";

test("desktop retrieves hosted runs, results and files through scoped authenticated APIs", async () => {
  const localRoot = mkdtempSync(path.join(os.tmpdir(), "relay-local-"));
  const backendRoot = mkdtempSync(path.join(os.tmpdir(), "relay-backend-"));
  const localStore = new Store(localRoot),
    backendStore = new Store(backendRoot);
  const secrets = new Map<string, string>();
  const local = new Service(localStore, "local", {
    set: async (k, v) => {
      secrets.set(k, v);
    },
    get: async (k) => secrets.get(k) || "",
  });
  const backend = new Service(backendStore, "hosted");
  const server = serve(backend, 0);
  await new Promise<void>((r) => server.on("listening", r));
  const endpoint = `http://127.0.0.1:${(server.address() as any).port}`;
  try {
    const a = await local.request("alex", {
      method: "saveAgent",
      payload: {
        name: "Hosted review",
        location: "hosted",
        workflow: workflowSchema.parse({
          sites: [],
          steps: [
            {
              id: "review",
              title: "Review collected information",
              action: "human",
              assignedTo: "runner",
            },
          ],
        }),
      },
    });
    backendStore.put("agent", a);
    const token = await backend.request("alex", {
      method: "token",
      payload: { agentId: a.id },
    });
    await local.request("alex", {
      method: "backend",
      payload: { id: a.id, endpoint, token: token.token },
    });
    const run = await local.request("alex", {
      method: "run",
      payload: { id: a.id, test: true },
    });
    assert.equal(
      localStore.all("run").length,
      0,
      "hosted run must not be copied to local SQLite",
    );
    await backend.runtime.execute(run.id);
    local.remote.invalidate("alex", a.id);
    let snapshot = await local.request("alex", {
      method: "snapshot",
      payload: {},
    });
    assert.equal(snapshot.runs[0].state, "Needs input");
    await local.request("alex", { method: "resume", payload: { id: run.id } });
    await backend.runtime.execute(run.id);
    const artifactPath = path.join(backendRoot, "test.csv");
    writeFileSync(artifactPath, "id,total\nA,12\n");
    backendStore.put("artifact", {
      id: "hosted-file",
      owner: "alex",
      runId: run.id,
      name: "test.csv",
      path: artifactPath,
    });
    local.remote.invalidate("alex", a.id);
    snapshot = await local.request("alex", { method: "snapshot", payload: {} });
    assert.equal(snapshot.runs[0].state, "Completed");
    assert.equal(snapshot.artifacts[0].id, "hosted-file");
    const results = await local.request("alex", {
      method: "results",
      payload: { id: a.id },
    });
    assert.equal(results.rows.length, 1);
    assert.equal(localStore.all("result").length, 0);
    const file = await local.request("alex", {
      method: "artifact",
      payload: { id: "hosted-file" },
    });
    assert.match(Buffer.from(file.base64, "base64").toString(), /A,12/);
    const preview = await local.request("alex", {
      method: "artifact",
      payload: { id: "hosted-file", preview: true },
    });
    assert.equal(preview.sheets[0].rows[1][0], "A");
    const csv = await local.request("alex", {
      method: "export",
      payload: { id: a.id, format: "csv" },
    });
    assert.match(
      Buffer.from(csv.base64, "base64").toString(),
      /Workflow completed/,
    );
    await assert.rejects(() =>
      local.request("jordan", {
        method: "artifact",
        payload: { id: "hosted-file" },
      }),
    );
    await local.request("alex", {
      method: "saveAgent",
      payload: { ...a, status: "Ready" },
    });
    assert.equal(backendStore.get("agent", a.id).status, "Ready");
  } finally {
    await local.close();
    await backend.close();
    await new Promise<void>((r) => server.close(() => r()));
    localStore.close();
    backendStore.close();
    rmSync(localRoot, { recursive: true, force: true });
    rmSync(backendRoot, { recursive: true, force: true });
  }
});

test("completion webhooks have verifiable signatures and bounded retry state", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "relay-webhook-"));
  const store = new Store(root);
  const service = new Service(store);
  let received: any;
  let calls = 0;
  const server = http.createServer(async (req, res) => {
    let body = "";
    for await (const c of req) body += c;
    received = { body, headers: req.headers };
    calls++;
    res.writeHead(calls === 1 ? 503 : 200).end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const oldURL = process.env.RELAY_WEBHOOK_URL,
    oldSecret = process.env.RELAY_WEBHOOK_SECRET;
  process.env.RELAY_WEBHOOK_URL = `http://127.0.0.1:${(server.address() as any).port}`;
  process.env.RELAY_WEBHOOK_SECRET = "test-webhook-secret";
  try {
    store.put("run", {
      id: "complete",
      agentId: "orders",
      owner: "alex",
      state: "Completed",
    });
    await deliverWebhooks(store);
    const delivery = store.get("delivery", "webhook:complete");
    assert.equal(delivery.attempts, 1);
    assert.ok(!delivery.done);
    assert.equal(
      received.headers["relay-signature"],
      "sha256=" +
        createHmac("sha256", "test-webhook-secret")
          .update(received.headers["relay-timestamp"] + "." + received.body)
          .digest("hex"),
    );
    store.put("delivery", { ...delivery, next: 0 });
    await deliverWebhooks(store);
    assert.equal(store.get("delivery", delivery.id).done, true);
    await deliverWebhooks(store);
    assert.equal(calls, 2);
  } finally {
    if (oldURL) process.env.RELAY_WEBHOOK_URL = oldURL;
    else delete process.env.RELAY_WEBHOOK_URL;
    if (oldSecret) process.env.RELAY_WEBHOOK_SECRET = oldSecret;
    else delete process.env.RELAY_WEBHOOK_SECRET;
    await service.close();
    await new Promise<void>((r) => server.close(() => r()));
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
