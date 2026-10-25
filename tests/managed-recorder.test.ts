import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fixture } from "../packages/server/fixture";
import { Store } from "../packages/shared-runtime/store";
import { Service } from "../packages/shared-runtime/service";
import { sites } from "../packages/shared-runtime/schema";
const wait = async (condition: () => boolean) => {
  for (let i = 0; i < 100; i++) {
    if (condition()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Recording condition timed out");
};
test(
  "managed recorder: automatic connection, navigation, tabs, frames, secrets, pause, finish and isolation",
  { timeout: 90000 },
  async () => {
    process.env.RELAY_HEADLESS = "1";
    const server = await fixture(0);
    const origin = `http://127.0.0.1:${(server.address() as any).port}`;
    const previous = sites[0].origin;
    sites[0].origin = origin;
    const root = await mkdtemp(path.join(os.tmpdir(), "relay-recording-"));
    const store = new Store(root),
      service = new Service(store);
    try {
      const session = await service.request("alex", {
        method: "startRecording",
        payload: { agentId: "orders" },
      });
      assert.equal(session.status, "recording", session.error);
      const context = (service.recorder as any).active.context;
      const page = context.pages()[0];
      await page.getByText(/Recording ·/).waitFor();
      await page.getByLabel("Email").fill("private@example.test");
      await page.getByLabel("Password").fill("super-secret-password");
      await page.getByRole("button", { name: "Sign in" }).click();
      await page.waitForURL("**/orders");
      await page.goto(origin + "/recording-lab");
      await page.getByText(/Recording ·/).waitFor();
      await page.getByLabel("Task note", { exact: true }).fill("captured note");
      await page.getByLabel(/^Category/).focus();
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Tab");
      await page.getByLabel("Verification code").fill("secret-12345");
      await page
        .getByRole("button", { name: "Mark reviewed", exact: true })
        .click();
      const frame = page.frameLocator("iframe");
      await frame.getByLabel("Task note").fill("frame note");
      await frame.getByRole("button", { name: "Mark reviewed" }).click();
      await wait(() =>
        service.recorder
          .state("alex")!
          .events.some((e: any) => e.value === "frame note"),
      );
      await page.getByRole("button", { name: "Pause", exact: true }).click();
      await wait(() => service.recorder.state("alex")!.status === "paused");
      await page
        .getByLabel("Task note", { exact: true })
        .fill("not captured while paused");
      await page
        .getByRole("button", { name: "Mark reviewed", exact: true })
        .click();
      await page.getByRole("button", { name: "Resume", exact: true }).click();
      const [tab] = await Promise.all([
        context.waitForEvent("page"),
        page.getByRole("link", { name: "Open another tab" }).click(),
      ]);
      await tab.getByText(/Recording ·/).waitFor();
      await tab.getByLabel("Task note", { exact: true }).fill("new tab note");
      await tab
        .getByRole("button", { name: "Mark reviewed", exact: true })
        .click();
      await tab.getByRole("link", { name: "Next page" }).click();
      await tab.getByText(/Recording ·/).waitFor();
      await tab
        .getByLabel("Task note", { exact: true })
        .fill("after navigation");
      await tab
        .getByRole("button", { name: "Mark reviewed", exact: true })
        .click();
      await wait(() =>
        service.recorder
          .state("alex")!
          .events.some((e: any) => e.value === "after navigation"),
      );
      await assert.rejects(service.recorder.control("sam", "finish"));
      assert.equal(service.recorder.state("sam"), null);
      const active = (service.recorder as any).active;
      assert.equal(
        (
          await fetch(
            `http://127.0.0.1:${active.server.address().port}/session`,
            { method: "POST", body: "{}" },
          )
        ).status,
        401,
      );
      await tab.getByRole("button", { name: "Finish", exact: true }).click();
      await wait(() => service.recorder.state("alex")!.status === "finished");
      const saved = store.get("recording", session.id)!;
      const serialized = JSON.stringify(saved);
      for (const excluded of [
        "private@example.test",
        "super-secret-password",
        "secret-12345",
        "not captured while paused",
      ])
        assert.ok(!serialized.includes(excluded), excluded);
      assert.ok(
        saved.events.some((e: any) => e.frame && e.value === "frame note"),
      );
      assert.ok(saved.events.some((e: any) => e.value === "new tab note"));
      assert.ok(new Set(saved.events.map((e: any) => e.tab)).size >= 2);
      assert.ok(saved.events.some((e: any) => e.action === "select"));
      await service.recorder.cleanup();
      await service.recorder.start("alex", "orders");
      await wait(() => service.recorder.state("alex")!.count > 0);
      await assert.rejects(
        service.recorder.control("alex", "cancel"),
        /Confirm/,
      );
      const cancelPage = (service.recorder as any).active.context.pages()[0];
      await cancelPage.getByText(/Recording ·/).waitFor();
      cancelPage.once("dialog", (dialog: any) => dialog.dismiss());
      await cancelPage
        .getByRole("button", { name: "Cancel", exact: true })
        .click();
      assert.equal(service.recorder.state("alex")!.status, "recording");
      cancelPage.once("dialog", (dialog: any) => dialog.accept());
      await cancelPage
        .getByRole("button", { name: "Cancel", exact: true })
        .click();
      await wait(() => service.recorder.state("alex")!.status === "cancelled");
      await service.recorder.cleanup();
      assert.equal(
        store.all("recordingSession").some((s) => s.status === "recording"),
        false,
      );
      await service.recorder.start("alex", "orders");
      await wait(() => service.recorder.state("alex")!.count > 0);
      await service.recorder.close("alex");
      assert.equal(service.recorder.state("alex")!.status, "interrupted");
      await service.recorder.control("alex", "finish");
      await service.recorder.control("alex", "reviewed");
      assert.equal(service.recorder.state("alex")!.status, "reviewed");
      assert.equal(store.get("agent", "orders")!.wizardStage, 2);
      const starting = service.recorder.start("alex", "orders");
      await wait(() => !!(service.recorder as any).active?.launch);
      await service.recorder.close("alex");
      await starting;
      assert.equal(service.recorder.state("alex")!.status, "interrupted");
      assert.equal((service.recorder as any).active, undefined);
      store.put("team", { ...store.get("team", "Operations"), id: "Operations", sites: [] });
      await assert.rejects(() => service.recorder.start("alex", "orders"), /approved website/);
    } finally {
      await service.close();
      store.close();
      sites[0].origin = previous;
      await new Promise<void>((r) => server.close(() => r()));
      await rm(root, { recursive: true, force: true });
    }
  },
);
