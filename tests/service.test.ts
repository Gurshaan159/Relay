import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Store } from "../packages/shared-runtime/store";
import { Service } from "../packages/shared-runtime/service";
import { interpret, redact } from "../packages/shared-runtime/recording";
import { allowedURL, safeFile } from "../packages/shared-runtime/runtime";
import { serve } from "../packages/server/http";
function setup() {
  const root = mkdtempSync(path.join(os.tmpdir(), "relay-test-"));
  const store = new Store(root);
  const service = new Service(store);
  return {
    store,
    service,
    close: () => {
      store.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}
test("demo identity isolation, team visibility, immutable originals and clean duplication", async () => {
  const { service, store, close } = setup();
  try {
    const alex = await service.request("alex", {
      method: "snapshot",
      payload: {},
    });
    assert.equal(alex.agents.length, 2);
    const sam = await service.request("sam", {
      method: "snapshot",
      payload: {},
    });
    assert.equal(sam.agents.length, 0);
    await assert.rejects(() =>
      service.request("sam", {
        method: "duplicate",
        payload: { id: "orders" },
      }),
    );
    await assert.rejects(() =>
      service.request("alex", {
        method: "saveAgent",
        payload: { ...store.get("agent", "team-records"), name: "Changed" },
      }),
    );
    const copy = await service.request("alex", {
      method: "duplicate",
      payload: { id: "team-records" },
    });
    assert.equal(copy.owner, "alex");
    assert.equal(copy.shared, false);
    assert.equal(copy.status, "Draft");
    assert.equal(store.all("connection").length, 0);
  } finally {
    close();
  }
});
test("connection checks, API idempotency and private outputs", async () => {
  const { service, store, close } = setup();
  try {
    assert.throws(() => service.submit("alex", "team-records", {}), /Connect/);
    store.put("connection", {
      id: "alex:local:fixture",
      owner: "alex",
      site: "fixture",
      location: "local",
      status: "Connected",
    });
    const a = service.submit("alex", "team-records", {}, "same");
    const b = service.submit("alex", "team-records", {}, "same");
    assert.equal(a.id, b.id);
    assert.throws(() => store.run(a.id, "jordan"));
    store.results(a, [{ id: "A", value: 12 }], "http://127.0.0.1:4318/orders");
    const other = await service.request("jordan", {
      method: "results",
      payload: { id: "team-records" },
    });
    assert.equal(other.rows.length, 0);
  } finally {
    close();
  }
});
test("upsert retains previous result values and origin", () => {
  const { service, store, close } = setup();
  try {
    store.put("connection", { id: "alex:local:fixture", status: "Connected" });
    const run = service.submit("alex", "team-records", {});
    run.workflow.output = { format: "table", mode: "update", uniqueKey: "id" };
    store.results(run, [{ id: "A", amount: 1 }], "source");
    store.results({ ...run, id: "second" }, [{ id: "A", amount: 2 }], "source");
    assert.equal(store.all("result")[0].data.amount, 2);
    assert.equal(store.all("resultHistory")[0].data.amount, 1);
    assert.equal(store.all("result")[0].runId, "second");
  } finally {
    close();
  }
});
test("recorder excludes sensitive fields and strips URL credentials", () => {
  const events = [
    { action: "fill", inputType: "password", value: "never" },
    { action: "fill", name: "access_token", value: "never" },
    {
      action: "navigate",
      url: "https://user:pass@example.com/path?token=secret#hash",
    },
    {
      action: "fill",
      name: "Search",
      value: "orders",
      locator: "label=Search",
    },
  ];
  const safe = redact(events);
  assert.equal(safe.length, 2);
  assert.equal(safe[0].url, "https://example.com/path");
  assert.equal(interpret(events).steps.length, 2);
  assert.ok(!JSON.stringify(safe).includes("never"));
});
test("URL and file boundaries reject unapproved locations", () => {
  assert.throws(() => allowedURL("http://169.254.169.254/latest/meta-data"));
  assert.throws(() => allowedURL("http://127.0.0.1:4318.evil.test"));
  assert.throws(() => safeFile(os.tmpdir(), "../secret"));
  assert.throws(() => safeFile(os.tmpdir(), "C:\\secret"));
  assert.equal(
    allowedURL("http://127.0.0.1:4318/orders"),
    "http://127.0.0.1:4318/orders",
  );
});
test("authenticated API returns queued run, idempotency and rejects cross-scope requests", async () => {
  const { service, store, close } = setup();
  store.put("connection", { id: "alex:local:fixture", status: "Connected" });
  const token = await service.request("jordan", {
    method: "token",
    payload: { agentId: "team-records" },
  });
  store.put("connection", { id: "jordan:local:fixture", status: "Connected" });
  const server = serve(service, 0);
  await new Promise<void>((r) => server.on("listening", r));
  const port = (server.address() as any).port;
  try {
    const endpoint = `http://127.0.0.1:${port}`;
    assert.equal((await fetch(endpoint + "/runs/nope")).status, 401);
    const options = {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": "one",
      },
      body: '{"inputs":{}}',
    };
    const first = await fetch(endpoint + "/agents/team-records/runs", options);
    assert.equal(first.status, 202);
    const a: any = await first.json();
    const b: any = await (
      await fetch(endpoint + "/agents/team-records/runs", options)
    ).json();
    assert.equal(a.id, b.id);
    assert.equal(
      (await fetch(endpoint + "/agents/orders/runs", options)).status,
      403,
    );
    assert.equal(a.state, "Queued");
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    close();
  }
});
test("restart recovery never marks an interrupted run successful", async () => {
  const { service, store, close } = setup();
  try {
    store.put("connection", { id: "alex:local:fixture", status: "Connected" });
    const run = service.submit("alex", "team-records", {});
    store.put("run", { ...run, state: "Running", inflight: 1 });
    service.start();
    assert.equal(store.get("run", run.id).state, "Needs input");
    await service.close();
  } finally {
    close();
  }
});
