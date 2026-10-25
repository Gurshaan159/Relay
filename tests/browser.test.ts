import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { fixture } from "../packages/server/fixture";
import { Store } from "../packages/shared-runtime/store";
import { Service } from "../packages/shared-runtime/service";
import { interpret } from "../packages/shared-runtime/recording";
import {spawn} from 'node:child_process';
test(
  "real fixture: login, XLSX download/filter/summary, human resume, upload and persisted results",
  { timeout: 90000 },
  async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "relay-browser-"));
    const server = await fixture();
    const store = new Store(root);
    const secretValues = new Map<string, string>();
    const service = new Service(store, "local", {
      get: async (key) => secretValues.get(key) || "",
      set: async (key, value) => {
        secretValues.set(key, value);
      },
    });
    service.runtime.headless = true;
    try {
      const profile = path.join(root, "profiles", "alex", "local", "fixture");
      const browser = await chromium.launchPersistentContext(profile, {
        headless: true,
      });
      const page = browser.pages()[0];
      await page.goto("http://127.0.0.1:4318/login");
      await page.getByLabel("Email").fill("alex@example.test");
      await page.getByLabel("Password").fill("fixture-only");
      await page.getByRole("button", { name: "Sign in" }).click();
      await page.waitForURL("**/orders");
      await browser.close();
      store.put("connection", {
        id: "alex:local:fixture",
        owner: "alex",
        site: "fixture",
        location: "local",
        status: "Connected",
      });
      const run = service.submit("alex", "orders", {}, undefined, true);
      await service.runtime.execute(run.id);
      let current = store.get("run", run.id);
      assert.equal(current.state, "Needs input", current.error);
      assert.equal(current.step, 3);
      assert.equal(current.outputs.overdue.records.length, 2);
      await service.request("alex", {
        method: "resume",
        payload: { id: run.id },
      });
      await service.runtime.execute(run.id);
      current = store.get("run", run.id);
      assert.equal(current.state, "Completed", current.error);
      assert.match(current.outputs.confirmation, /uploaded successfully/);
      assert.equal(store.all("result").length, 2);
      assert.equal(store.all("artifact").length, 2);
      const artifact = store.all("artifact")[1];
      await assert.rejects(() =>
        service.request("jordan", {
          method: "artifact",
          payload: { id: artifact.id },
        }),
      );
      const recorded = interpret([
        {
          action: "navigate",
          url: "http://127.0.0.1:4318/orders",
          timestamp: new Date().toISOString(),
        },
      ]);
      recorded.steps[0].url = "http://127.0.0.1:4318/orders?changed=1";
      recorded.steps.push({
        id: "collect",
        title: "Collect records",
        action: "read",
        locator: "css=#records",
        output: "records",
        recommendation: "Automate",
        reason: "Read structured records from the reviewed page.",
      });
      const created = await service.request("alex", {
        method: "saveAgent",
        payload: { name: "Recorded and reviewed orders", workflow: recorded },
      });
      const testRun = service.submit("alex", created.id, {}, undefined, true);
      await service.runtime.execute(testRun.id);
      assert.equal(
        store.get("run", testRun.id).state,
        "Completed",
        "semantic reading survives the changed layout",
      );
      const enabled = await service.request("alex", {
        method: "saveAgent",
        payload: { ...created, status: "Ready", shared: true },
      });
      const repeat = service.submit("alex", enabled.id, {});
      await service.runtime.execute(repeat.id);
      assert.equal(store.get("run", repeat.id).state, "Completed");
      assert.throws(
        () => service.submit("jordan", enabled.id, {}),
        /Connect/,
        "sharing never grants the owner connection",
      );
      const copy = await service.request("jordan", {
        method: "duplicate",
        payload: { id: enabled.id },
      });
      assert.equal(copy.status, "Draft");
      assert.equal(
        store.all("result").filter((r) => r.owner === "jordan").length,
        0,
      );
      const broken = await service.request("alex", {
        method: "saveAgent",
        payload: {
          name: "Changed page recovery",
          workflow: {
            ...recorded,
            steps: [
              recorded.steps[0],
              {
                id: "missing",
                title: "Read a removed element",
                action: "read",
                locator: "css=#removed-records",
                output: "records",
              },
            ],
          },
        },
      });
      const unexpected = service.submit("alex", broken.id, {}, undefined, true);
      await service.runtime.execute(unexpected.id);
      assert.equal(store.get("run", unexpected.id).state, "Needs input");
      assert.match(
        store.get("run", unexpected.id).error,
        /Read a removed element/,
      );
      await service.request("alex", {
        method: "cancel",
        payload: { id: unexpected.id },
      });
      assert.equal(store.get("run", unexpected.id).state, "Cancelled");
      await assert.rejects(
        () =>
          service.request("alex", {
            method: "connect",
            payload: { site: "fixture-api", credential: "wrong-key" },
          }),
        /verification failed/,
      );
      await service.request("alex", {
        method: "connect",
        payload: { site: "fixture-api", credential: "fixture-only-key" },
      });
      const apiAgent = await service.request("alex", {
        method: "saveAgent",
        payload: {
          name: "API orders",
          workflow: {
            sites: ["fixture-api"],
            steps: [
              {
                id: "fetch",
                title: "Read orders using my API account",
                action: "http",
                url: "http://127.0.0.1:4318/api/token-orders",
                output: "records",
              },
            ],
          },
        },
      });
      const apiRun = service.submit("alex", apiAgent.id, {}, undefined, true);
      await service.runtime.execute(apiRun.id);
      assert.equal(store.get("run", apiRun.id).state, "Completed");
      assert.equal(store.get("run", apiRun.id).outputs.records.length, 3);
      assert.ok(!JSON.stringify(store.all("run")).includes("fixture-only-key"));
      await service.request("alex", {
        method: "disconnect",
        payload: { site: "fixture-api" },
      });
      assert.equal(secretValues.get("alex:local:fixture-api"), "");
      const hostedBrowser=await chromium.launchPersistentContext(path.join(root,'profiles','alex','hosted','fixture'),{headless:true});
      const hostedPage=hostedBrowser.pages()[0];await hostedPage.goto('http://127.0.0.1:4318/login');await hostedPage.getByLabel('Email').fill('alex-hosted@example.test');await hostedPage.getByLabel('Password').fill('hosted-fixture-only');await hostedPage.getByRole('button',{name:'Sign in'}).click();await hostedPage.waitForURL('**/orders');await hostedBrowser.close();
      store.put('connection',{id:'alex:hosted:fixture',owner:'alex',site:'fixture',location:'hosted',status:'Connected'});
      const hostedAgent=await service.request('alex',{method:'saveAgent',payload:{...store.get('agent','orders'),id:undefined,name:'Hosted fixture browser journey',location:'hosted'}});
      const hostedRun=service.submit('alex',hostedAgent.id,{},undefined,true);
      const child=spawn(process.execPath,['--import','tsx','packages/server/worker.ts'],{cwd:process.cwd(),env:{...process.env,RELAY_DATA_DIR:root,RELAY_HEADLESS:'1'},stdio:['ignore','pipe','pipe','ipc'],windowsHide:true});
      const until=async(state:string)=>{const deadline=Date.now()+20000;while(Date.now()<deadline&&store.get('run',hostedRun.id).state!==state)await new Promise(r=>setTimeout(r,100));assert.equal(store.get('run',hostedRun.id).state,state,store.get('run',hostedRun.id).error)};
      try{await until('Needs input');assert.equal(store.get('run',hostedRun.id).step,3);await service.request('alex',{method:'resume',payload:{id:hostedRun.id}});await until('Completed');assert.match(store.get('run',hostedRun.id).outputs.confirmation,/uploaded successfully/);}
      finally{if(child.exitCode===null){child.send('shutdown');await new Promise<void>(resolve=>child.once('exit',()=>resolve()))}}
    } finally {
      await service.close();
      store.close();
      await new Promise<void>((r) => server.close(() => r()));
      rmSync(root, { recursive: true, force: true });
    }
  },
);
