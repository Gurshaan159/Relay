import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Store } from "../packages/shared-runtime/store";
import { Service } from "../packages/shared-runtime/service";
import { workflowSchema } from "../packages/shared-runtime/schema";
function setup() {
  const root = mkdtempSync(path.join(os.tmpdir(), "relay-admin-"));
  const store = new Store(root);
  const service = new Service(store);
  return {
    store,
    service,
    request: (owner: string, method: any, payload: any = {}) =>
      service.request(owner, { method, payload }),
    close: () => {
      store.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}
const csv = Buffer.from(
  "id,status,amount\nA,open,10\nB,closed,5\nC,open,7\n",
).toString("base64");
test("admin methods require the admin role", async () => {
  const { request, close } = setup();
  try {
    for (const method of [
      "admin",
      "setTeamSites",
      "moveMember",
      "addCollection",
      "updateCollection",
      "removeCollection",
    ])
      await assert.rejects(() => request("jordan", method), /Admin access/);
    const admin = await request("alex", "admin");
    assert.deepEqual(
      admin.teams.map((t: any) => t.id).sort(),
      ["Customer success", "Operations"],
    );
    assert.ok(admin.teams.every((t: any) => t.sites.includes("fixture")));
  } finally {
    close();
  }
});
test("team website approval controls connections, readiness and runs", async () => {
  const { service, store, request, close } = setup();
  try {
    await request("alex", "setTeamSites", {
      team: "Operations",
      sites: ["fixture-api"],
    });
    await assert.rejects(() => request("alex", "setTeamSites", {
      team: "Operations",
      sites: ["https://example.com"],
    }));
    const snapshot = await request("jordan", "snapshot");
    assert.deepEqual(snapshot.allowedSites, ["fixture-api"]);
    await assert.rejects(
      () => request("jordan", "connect", { site: "fixture" }),
      /not approved/,
    );
    store.put("connection", {
      id: "jordan:local:fixture",
      owner: "jordan",
      site: "fixture",
      location: "local",
      status: "Connected",
    });
    assert.ok(
      snapshot.readiness["team-records"].some((i: string) =>
        i.includes("not approved for your team"),
      ),
    );
    assert.throws(() => service.submit("jordan", "team-records", {}));
    const sam = await request("sam", "snapshot");
    assert.ok(sam.allowedSites.includes("fixture"));
  } finally {
    close();
  }
});
test("moving a member moves their agents and keeps owner-only edits", async () => {
  const { store, request, close } = setup();
  try {
    await request("alex", "moveMember", {
      id: "jordan",
      team: "Customer success",
    });
    assert.equal(store.employee("jordan").team, "Customer success");
    assert.equal(store.get("agent", "team-records").team, "Customer success");
    const alex = await request("alex", "snapshot");
    assert.ok(!alex.agents.some((a: any) => a.id === "team-records"));
    const sam = await request("sam", "snapshot");
    assert.ok(sam.agents.some((a: any) => a.id === "team-records"));
    await assert.rejects(() =>
      request("sam", "saveAgent", {
        ...store.get("agent", "team-records"),
        name: "Changed",
      }),
    );
    await assert.rejects(() =>
      request("alex", "moveMember", { id: "jordan", team: "Nope" }),
    );
  } finally {
    close();
  }
});
test("team data collections are scoped, previewable and usable by agents", async () => {
  const { service, store, request, close } = setup();
  try {
    await assert.rejects(() =>
      request("alex", "addCollection", {
        name: "Bad",
        team: "Operations",
        fileName: "notes.txt",
        base64: csv,
      }),
    );
    const c = await request("alex", "addCollection", {
      name: "Open orders",
      team: "Operations",
      fileName: "orders.CSV",
      base64: csv,
    });
    assert.equal(c.path, undefined);
    assert.equal(c.fileName, "orders.csv");
    assert.deepEqual(c.columns, ["id", "status", "amount"]);
    assert.equal(c.rows, 3);
    assert.equal((await request("jordan", "snapshot")).collections.length, 1);
    assert.equal((await request("sam", "snapshot")).collections.length, 0);
    assert.equal(
      (await request("jordan", "collection", { id: c.id })).sheets[0].rows
        .length,
      4,
    );
    await assert.rejects(() => request("sam", "collection", { id: c.id }));
    store.put("agent", {
      id: "filter-data",
      owner: "jordan",
      team: "Operations",
      name: "Filter team data",
      description: "",
      status: "Ready",
      shared: false,
      location: "local",
      version: 1,
      intervalMinutes: null,
      wizardStage: 5,
      workflow: workflowSchema.parse({
        sites: [],
        steps: [
          {
            id: "filter",
            title: "Filter open orders",
            action: "spreadsheet",
            file: `collection:${c.id}`,
            value: JSON.stringify({
              filter: { column: "status", equals: "open" },
              format: "csv",
            }),
            output: "open",
          },
        ],
      }),
    });
    const run = service.submit("jordan", "filter-data", {});
    await service.runtime.execute(run.id);
    const done = store.get("run", run.id);
    assert.equal(done.state, "Completed", done.error);
    assert.equal(
      store.all("result").filter((r) => r.runId === run.id).length,
      2,
    );
    await request("alex", "updateCollection", {
      id: c.id,
      team: "Customer success",
    });
    assert.throws(
      () => service.submit("jordan", "filter-data", {}),
      /not available/,
    );
    await request("alex", "removeCollection", { id: c.id });
    assert.equal(store.all("collection").length, 0);
  } finally {
    close();
  }
});
