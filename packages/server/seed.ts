import { Store } from "../shared-runtime/store";
import { Service } from "../shared-runtime/service";
import { hostedVault } from "../shared-runtime/vault";
import { workflowSchema } from "../shared-runtime/schema";
const store = new Store();
store.seed();
const service = new Service(
  store,
  process.env.RELAY_LOCATION || "hosted",
  hostedVault(store.root),
);
const command = process.argv[2];
if (command === "provision") {
  const owner = process.argv[3] || "alex";
  const id = process.argv[4];
  if (!id || !/^[a-zA-Z0-9-]+$/.test(id))
    throw Error("Provide the agent ID shown in desktop Integrations");
  const employee = store.employee(owner);
  if (!store.get("agent", id))
    store.put("agent", {
      id,
      owner,
      team: employee.team,
      name: "Provisioned desktop agent",
      description: "Waiting for desktop configuration",
      workflow: workflowSchema.parse({ steps: [], sites: [] }),
      status: "Draft",
      shared: false,
      location: "hosted",
      version: 1,
      intervalMinutes: null,
      wizardStage: 0,
    });
  console.log(
    await service.request(owner, {
      method: "token",
      payload: { agentId: id, name: "Desktop hosted integration" },
    }),
  );
  store.close();
} else if (command === "token")
  console.log(
    await service.request(process.argv[3] || "alex", {
      method: "token",
      payload: {
        agentId: process.argv[4] || "orders",
        name: "CLI integration",
      },
    }),
  );
else if (command === "connect") {
  const owner = process.argv[3] || "alex";
  await service.request(owner, {
    method: "connect",
    payload: { site: process.argv[4] || "fixture", location: service.location },
  });
  console.log("Sign in in the browser, then press Enter here.");
  process.stdin.once("data", async () => {
    await service.request(owner, {
      method: "finishConnect",
      payload: { site: process.argv[4] || "fixture" },
    });
    console.log("Hosted connection saved.");
    await service.close();
    store.close();
    process.exit();
  });
} else {
  console.log(`Seeded demo data at ${store.root}`);
  store.close();
}
