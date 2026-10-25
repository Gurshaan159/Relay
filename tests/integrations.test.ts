import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Store } from "../packages/shared-runtime/store";
import { Service } from "../packages/shared-runtime/service";
import { serve } from "../packages/server/http";
import { workflowSchema } from "../packages/shared-runtime/schema";
import { spawn } from "node:child_process";
import ExcelJS from "exceljs";
import { tableFile } from "../packages/shared-runtime/tabular";
test("paired recorder requires a one-time code and an authenticated token", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "relay-pair-"));
  const store = new Store(root);
  const service = new Service(store);
  const server = serve(service, 0, true);
  await new Promise<void>((r) => server.on("listening", r));
  const endpoint = `http://127.0.0.1:${(server.address() as any).port}`;
  const post = (route: string, body: any, token = "") =>
    fetch(endpoint + route, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  try {
    assert.equal((await post("/recordings", { events: [] })).status, 401);
    const pair = await service.request("alex", { method: "pair", payload: {} });
    const result: any = await (await post("/pair", { code: pair.code })).json();
    assert.ok(result.token);
    assert.equal((await post("/pair", { code: pair.code })).status, 400);
    assert.equal(
      (
        await post(
          "/recordings",
          {
            events: [
              { action: "fill", inputType: "password", value: "hidden" },
              { action: "click", name: "Submit" },
            ],
          },
          result.token,
        )
      ).status,
      200,
    );
    assert.equal(store.all("recording")[0].events.length, 1);
    assert.equal(
      (await service.request("jordan", { method: "recordings", payload: {} }))
        .length,
      0,
    );
  } finally {
    await service.close();
    await new Promise<void>((r) => server.close(() => r()));
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
test("offline local runs wait, outbound claim is scoped, cancellation persists", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "relay-offline-"));
  const store = new Store(root);
  const service = new Service(store, "hosted");
  store.put("connection", { id: "jordan:local:fixture", status: "Connected" });
  const token = await service.request("jordan", {
    method: "token",
    payload: { agentId: "team-records" },
  });
  const run = service.submit("jordan", "team-records", {});
  assert.equal(run.state, "Waiting for runner");
  const server = serve(service, 0);
  await new Promise<void>((r) => server.on("listening", r));
  const endpoint = `http://127.0.0.1:${(server.address() as any).port}`;
  const post = (route: string, body: any) =>
    fetch(endpoint + route, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  try {
    const claim: any = await (await post("/runner/claim", {})).json();
    assert.equal(claim.run.id, run.id);
    assert.equal(store.get("run", run.id).state, "Running");
    await post(`/runs/${run.id}/cancel`, {});
    const result: any = await (
      await post("/runner/checkpoint", { run: { ...run, state: "Completed" } })
    ).json();
    assert.equal(result.cancelled, true);
    assert.equal(store.get("run", run.id).state, "Cancelled");
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
test(
  "separately spawned hosted worker executes a durable queued workflow",
  { timeout: 20000 },
  async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "relay-hosted-"));
    const store = new Store(root);
    const service = new Service(store, "hosted");
    const agent = await service.request("alex", {
      method: "saveAgent",
      payload: {
        name: "Hosted data transformation",
        status: "Ready",
        location: "hosted",
        untested: true,
        workflow: workflowSchema.parse({
          sites: [],
          steps: [
            {
              id: "review",
              title: "Review fixture output",
              action: "human",
              assignedTo: "runner",
            },
          ],
        }),
      },
    });
    const run = service.submit("alex", agent.id, {});
    store.put("run", { ...run, approved: 0 });
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "packages/server/worker.ts"],
      {
        cwd: process.cwd(),
        env: { ...process.env, RELAY_DATA_DIR: root, RELAY_HEADLESS: "1" },
        stdio: "pipe",
        windowsHide: true,
      },
    );
    try {
      const end = Date.now() + 15000;
      while (Date.now() < end && store.get("run", run.id).state !== "Completed")
        await new Promise((r) => setTimeout(r, 200));
      assert.equal(store.get("run", run.id).state, "Completed");
      assert.equal(store.all("result").length, 1);
    } finally {
      child.kill();
      await new Promise<void>((r) => child.once("exit", () => r()));
      store.close();
      rmSync(root, { recursive: true, force: true });
    }
  },
);
test("CSV transformation filters, sorts, aggregates and exports XLSX summary", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "relay-csv-"));
  try {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Rows").addRows([
      ["id", "status", "amount"],
      ["B", "overdue", 5],
      ["A", "overdue", 10],
      ["C", "paid", 20],
    ]);
    const input = path.join(root, "input.csv"),
      output = path.join(root, "output.xlsx");
    await wb.csv.writeFile(input);
    const rows = await tableFile(input, output, {
      filter: { column: "status", equals: "overdue" },
      sort: { column: "id" },
      sum: "amount",
    });
    assert.deepEqual(
      rows.map((r) => r.id),
      ["A", "B"],
    );
    const result = new ExcelJS.Workbook();
    await result.xlsx.readFile(output);
    assert.equal(result.getWorksheet("Summary")!.getCell("B3").value, 15);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
