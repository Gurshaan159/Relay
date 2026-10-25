import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Store } from "../packages/shared-runtime/store";
import { Service } from "../packages/shared-runtime/service";
import { check, split } from "../packages/shared-runtime/models";
import { workflowSchema } from "../packages/shared-runtime/schema";
import { serve } from "../packages/server/http";
const TOKEN = "hf_test_secret_token_value";
const teams = ["Billing", "Shipping", "Technical"];
const rows = teams.flatMap((team) =>
  Array.from({ length: 12 }, (_, i) => ({
    id: `${team}-${i}`,
    message: `Customer message number ${i} about ${team.toLowerCase()} problems`,
    team,
    internal: "never send",
  })),
);
const csv = (list: Record<string, unknown>[]) =>
  Buffer.from(
    [
      Object.keys(list[0]).join(","),
      ...list.map((r) => Object.values(r).join(",")),
    ].join("\n") + "\n",
  ).toString("base64");
// Simulates the Hugging Face Hub, Jobs and Inference Endpoints APIs at the
// fetch boundary and records every call.
function fakeHub() {
  const calls: { method: string; url: string; body: string; auth?: string }[] =
    [];
  const state = { job: "SCHEDULING", endpoint: "initializing" };
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: any, init: any = {}) => {
    const url = String(input);
    if (url.startsWith("http://127.0.0.1")) return real(input, init);
    const method = init.method || "GET";
    const body = typeof init.body === "string" ? init.body : "";
    calls.push({ method, url, body, auth: init.headers?.Authorization });
    const json = (value: unknown, status = 200) =>
      new Response(JSON.stringify(value), { status });
    if (url.endsWith("/api/jobs/hardware"))
      return json([
        { name: "cpu-upgrade", prettyName: "CPU Upgrade", unitCostUSD: 0.0005, unitLabel: "minute" },
        { name: "t4-small", prettyName: "Nvidia T4 - small", unitCostUSD: 0.006667, unitLabel: "minute" },
      ]);
    if (url.endsWith("/v2/provider"))
      return json({
        vendors: [
          {
            name: "aws",
            regions: [
              {
                name: "us-east-1",
                computes: [
                  { id: "aws-us-east-1-intel-spr-x2", status: "available", pricePerHour: 0.067 },
                ],
              },
            ],
          },
        ],
      });
    if (init.headers?.Authorization !== `Bearer ${TOKEN}`)
      return json({ error: "Invalid credentials" }, 401);
    if (url.endsWith("/api/whoami-v2"))
      return json({ name: "relay-demo", orgs: [{ name: "northstar" }] });
    if (url.endsWith("/api/repos/create") || url.endsWith("/api/repos/delete"))
      return json({});
    if (url.includes("/preupload/main"))
      return json({
        files: JSON.parse(body).files.map((f: any) => ({
          path: f.path,
          uploadMode: "regular",
          shouldIgnore: false,
        })),
      });
    if (url.includes("/commit/main")) return json({ commitOid: "abc" });
    if (url.endsWith("/api/jobs/northstar") && method === "POST")
      return json({ id: "job-1", status: { stage: "SCHEDULING" } });
    if (url.endsWith("/api/jobs/northstar/job-1/cancel")) return json({});
    if (url.endsWith("/api/jobs/northstar/job-1"))
      return json({ id: "job-1", status: { stage: state.job, message: "boom" } });
    if (url.includes("/api/models/northstar/relay-model-"))
      return json({ sha: "rev123" });
    if (url.endsWith("/resolve/rev123/relay_eval.json"))
      return json({
        accuracy: 0.75,
        train_examples: 27,
        eval_examples: 9,
        per_label: { Billing: { examples: 3, precision: 1, recall: 0.67 } },
        samples: [{ text: "Where is my parcel", expected: "Shipping", predicted: "Shipping", score: 0.9 }],
      });
    if (url.endsWith("/v2/endpoint/northstar") && method === "POST")
      return json({ name: JSON.parse(body).name });
    if (url.includes("/v2/endpoint/northstar/") && method === "DELETE")
      return json({});
    if (url.includes("/v2/endpoint/northstar/"))
      return json({
        status: {
          state: state.endpoint,
          url: state.endpoint === "running" ? "https://ep.example.cloud" : undefined,
        },
      });
    if (url === "https://ep.example.cloud")
      return json([{ label: "Shipping", score: 0.91 }, { label: "Billing", score: 0.05 }]);
    return json({ error: `unexpected ${method} ${url}` }, 404);
  }) as typeof fetch;
  return { calls, state, restore: () => (globalThis.fetch = real) };
}
function setup() {
  const root = mkdtempSync(path.join(os.tmpdir(), "relay-models-"));
  const store = new Store(root);
  const vault = new Map<string, string>();
  const service = new Service(store, "local", {
    set: async (id, value) => void vault.set(id, value),
    get: async (id) => vault.get(id) || "",
  });
  return {
    store,
    service,
    vault,
    request: (owner: string, method: any, payload: any = {}) =>
      service.request(owner, { method, payload }),
    close: () => {
      store.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}
test("recipe checks explain unusable data and split keeps every category in evaluation", () => {
  const missing = check(
    [...rows, { message: "No category here", team: "" }],
    "message",
    "team",
  );
  assert.equal(missing.ok, false);
  assert.match(missing.problems[0].issue, /no “team”/);
  const small = check(rows.slice(0, 15), "message", "team");
  assert.ok(small.problems.some((p) => /fewer than 10/.test(p.issue)));
  const conflict = check(
    [...rows, { message: rows[0].message, team: "Shipping" }],
    "message",
    "team",
  );
  assert.ok(conflict.problems.some((p) => /different “team”/.test(p.issue)));
  const ids = check(rows, "message", "id");
  assert.equal(ids.ok, false);
  const ok = check([...rows, { message: "", team: "" }], "message", "team");
  assert.equal(ok.ok, true);
  assert.equal(ok.ignored, 1);
  const parts = split(ok.examples);
  assert.equal(parts.train.length + parts.eval.length, 36);
  for (const t of teams)
    assert.ok(parts.eval.filter((e) => e.label === t).length >= 2);
  const evalTexts = new Set(parts.eval.map((e) => e.text));
  assert.ok(parts.train.every((e) => !evalTexts.has(e.text)));
  assert.deepEqual(split(ok.examples), parts);
});
test("train, evaluate, publish and use a model through one published version", async () => {
  const hub = fakeHub();
  const { service, store, request, close } = setup();
  try {
    const c = await request("alex", "addCollection", {
      name: "Support inbox",
      team: "Operations",
      fileName: "inbox.csv",
      base64: csv(rows),
    });
    await assert.rejects(() => request("jordan", "modelPlan", { collectionId: c.id }), /Admin access/);
    const plan = await request("alex", "modelPlan", {
      collectionId: c.id,
      goal: "Route each message to the right team",
    });
    assert.equal(plan.suggestion.textColumn, "message");
    assert.equal(plan.suggestion.labelColumn, "team");
    assert.equal(plan.check.ok, true);
    assert.equal(plan.goal.fit, "classification");
    assert.equal(plan.training.find((t: any) => t.flavor === "t4-small").maxUSD, 0.006667 * 60);
    assert.equal(
      (await request("alex", "modelPlan", { collectionId: c.id, goal: "Summarize each message" })).goal.fit,
      "unsupported",
    );
    const train = {
      collectionId: c.id,
      textColumn: "message",
      labelColumn: "team",
      goal: "Route each message to the right team",
      flavor: "t4-small",
    };
    await assert.rejects(() => request("alex", "trainModel", { ...train, approved: true }), /Connect a Hugging Face/);
    await assert.rejects(() => request("alex", "connectProvider", { token: "hf_wrong_token" }));
    await assert.rejects(
      () => request("alex", "connectProvider", { token: TOKEN, namespace: "someone-else" }),
      /can’t use/,
    );
    await request("alex", "connectProvider", { token: TOKEN, namespace: "northstar" });
    assert.ok(!JSON.stringify(store.all("provider")).includes(TOKEN));
    await assert.rejects(() => request("alex", "trainModel", train), /Approve/);
    await assert.rejects(
      () => request("alex", "trainModel", { ...train, labelColumn: "id", approved: true }),
    );
    await assert.rejects(
      () => request("alex", "trainModel", { ...train, goal: "Write replies", approved: true }),
      /doesn’t fit/,
    );
    const model = await request("alex", "trainModel", { ...train, approved: true });
    assert.equal(model.state, "Training");
    assert.equal(model.jobId, "job-1");
    const commit = hub.calls.find((x) => x.url.includes("/commit/main"))!;
    const uploaded = commit.body
      .split("\n")
      .map((l) => JSON.parse(l))
      .filter((l) => l.key === "file")
      .map((l) => Buffer.from(l.value.content, "base64").toString());
    assert.equal(uploaded.length, 2);
    assert.ok(!uploaded.join("").includes("never send"));
    assert.deepEqual(Object.keys(JSON.parse(uploaded[0].split("\n")[0])), ["text", "label"]);
    const job = JSON.parse(hub.calls.find((x) => x.url.endsWith("/api/jobs/northstar"))!.body);
    assert.equal(job.flavor, "t4-small");
    assert.equal(job.timeoutSeconds, 3600);
    assert.equal(job.secrets.HF_TOKEN, TOKEN);
    assert.ok(!JSON.stringify(job.environment).includes(TOKEN));
    assert.match(job.environment.RELAY_TRAIN_SCRIPT, /upload_folder/);
    assert.ok(!JSON.stringify(store.all("model")).includes(TOKEN));
    await service.models.poll(true);
    assert.equal(store.get("model", model.id).status, "SCHEDULING");
    hub.state.job = "COMPLETED";
    await service.models.poll(true);
    const evaluated = store.get("model", model.id);
    assert.equal(evaluated.state, "Evaluated");
    assert.equal(evaluated.revision, "rev123");
    assert.ok(hub.calls.some((x) => x.url.endsWith("/api/repos/delete") && JSON.parse(x.body).type === "dataset"));
    await assert.rejects(() => request("alex", "predict", { id: model.id, text: "hi" }), /isn’t published/);
    await assert.rejects(
      () => request("alex", "publishModel", { id: model.id, hosting: "aws-us-east-1-intel-spr-x2" }),
      /Approve/,
    );
    await request("alex", "publishModel", { id: model.id, hosting: "aws-us-east-1-intel-spr-x2", approved: true });
    const endpoint = JSON.parse(hub.calls.find((x) => x.url.endsWith("/v2/endpoint/northstar"))!.body);
    assert.equal(endpoint.model.revision, "rev123");
    assert.equal(endpoint.model.task, "text-classification");
    assert.equal(endpoint.type, "authenticated");
    await service.models.poll(true);
    assert.equal(store.get("model", model.id).state, "Publishing");
    hub.state.endpoint = "running";
    await service.models.poll(true);
    assert.equal(store.get("model", model.id).state, "Published");
    const direct = await request("jordan", "predict", { id: model.id, text: "Where is my parcel" });
    assert.deepEqual([direct.label, direct.revision], ["Shipping", "rev123"]);
    await assert.rejects(() => request("sam", "predict", { id: model.id, text: "x" }), /not available/);
    assert.equal((await request("jordan", "snapshot")).models.length, 1);
    assert.equal((await request("sam", "snapshot")).models.length, 0);
    store.put("agent", {
      id: "route",
      owner: "jordan",
      team: "Operations",
      name: "Route a message",
      description: "",
      status: "Ready",
      shared: false,
      location: "local",
      version: 1,
      intervalMinutes: null,
      wizardStage: 5,
      workflow: workflowSchema.parse({
        sites: [],
        inputs: [{ name: "message", label: "Message" }],
        steps: [{ id: "m", title: "Pick a team", action: "model", model: model.id, value: "{{message}}", output: "team" }],
      }),
    });
    const run = service.submit("jordan", "route", { message: "Where is my parcel" });
    await service.runtime.execute(run.id);
    const done = store.get("run", run.id);
    assert.equal(done.state, "Completed", done.error);
    assert.equal(done.outputs.team.label, "Shipping");
    const { token } = await request("alex", "token", { modelId: model.id });
    const server = serve(service, 0, true);
    await new Promise<void>((r) => server.on("listening", r));
    const port = (server.address() as any).port;
    try {
      const call = (id: string, auth: string) =>
        fetch(`http://127.0.0.1:${port}/models/${id}/predict`, {
          method: "POST",
          headers: { Authorization: `Bearer ${auth}`, "Content-Type": "application/json" },
          body: JSON.stringify({ inputs: "Where is my parcel" }),
        });
      const ok = await call(model.id, token);
      assert.equal(ok.status, 200);
      assert.equal(((await ok.json()) as any).label, "Shipping");
      assert.equal((await call(model.id, "nope")).status, 401);
      assert.equal((await call("other", token)).status, 403);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
    await request("alex", "unpublishModel", { id: model.id });
    assert.equal(store.get("model", model.id).state, "Evaluated");
    assert.ok(hub.calls.some((x) => x.method === "DELETE" && x.url.includes("/v2/endpoint/northstar/relay-")));
    assert.ok(service.readiness("jordan", store.get("agent", "route")!).some((i) => /published model/.test(i)));
  } finally {
    hub.restore();
    await service.close();
    close();
  }
});
test("failed and cancelled jobs are reported, cleaned up, and never published", async () => {
  const hub = fakeHub();
  const { service, store, request, close } = setup();
  try {
    const c = await request("alex", "addCollection", {
      name: "Inbox",
      team: "Operations",
      fileName: "inbox.csv",
      base64: csv(rows),
    });
    await request("alex", "connectProvider", { token: TOKEN, namespace: "northstar" });
    const train = {
      collectionId: c.id,
      textColumn: "message",
      labelColumn: "team",
      goal: "Sort messages by team",
      flavor: "cpu-upgrade",
      approved: true,
    };
    const failed = await request("alex", "trainModel", train);
    hub.state.job = "ERROR";
    await service.models.poll(true);
    const f = store.get("model", failed.id);
    assert.equal(f.state, "Failed");
    assert.match(f.error, /boom/);
    await assert.rejects(() => request("alex", "publishModel", { id: f.id, hosting: "aws-us-east-1-intel-spr-x2", approved: true }));
    hub.state.job = "RUNNING";
    const running = await request("alex", "trainModel", train);
    await assert.rejects(() => request("alex", "disconnectProvider"), /Stop training/);
    await request("alex", "cancelModel", { id: running.id });
    assert.equal(store.get("model", running.id).state, "Cancelled");
    assert.ok(hub.calls.some((x) => x.url.endsWith("/job-1/cancel")));
    await request("alex", "disconnectProvider");
    assert.equal((await request("alex", "admin")).provider.connected, false);
  } finally {
    hub.restore();
    await service.close();
    close();
  }
});
