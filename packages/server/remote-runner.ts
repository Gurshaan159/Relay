import { Service } from "../shared-runtime/service";
import { Store } from "../shared-runtime/store";
import { workflowSchema, type Run } from "../shared-runtime/schema";
/** Authenticated outbound polling; no laptop listener is required. One token/agent per process. */
const endpoint = process.env.RELAY_BACKEND_URL;
const token = process.env.RELAY_RUNNER_TOKEN;
if (!endpoint || !token)
  throw Error("Set RELAY_BACKEND_URL and RELAY_RUNNER_TOKEN");
const url = new URL(endpoint);
if (
  url.protocol !== "https:" &&
  !["127.0.0.1", "localhost"].includes(url.hostname)
)
  throw Error("Remote backend requires HTTPS");
const service = new Service(new Store(), "local");
service.runtime.headless = process.env.RELAY_HEADLESS === "1";
let stopping = false;
async function call(route: string, body: unknown) {
  const r = await fetch(endpoint + route, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw Error("Backend request rejected");
  return r.json() as Promise<any>;
}
process.on("SIGINT", () => {
  stopping = true;
  void service.close();
});
process.on("SIGTERM", () => {
  stopping = true;
  void service.close();
});
while (!stopping) {
  try {
    await call("/runner/hello", {
      connections: service.store
        .all("connection")
        .filter(
          (c) =>
            c.location === "local" &&
            c.owner === (process.env.RELAY_EMPLOYEE || "alex"),
        )
        .map(({ site, status }) => ({ site, status })),
    });
    const claim = await call("/runner/claim", {});
    if (claim.run) {
      const remote = claim.run as Run;
      workflowSchema.parse(remote.workflow);
      service.store.employee(remote.owner);
      const previous = service.store.get<Run>("run", remote.id);
      if (previous && previous.step > remote.step) remote.step = previous.step;
      service.store.put("run", { ...remote, state: "Queued" });
      const sync = setInterval(async () => {
        try {
          const local = service.store.get<Run>("run", remote.id)!;
          const state = await call("/runner/checkpoint", { run: local });
          if (state.cancelled) {
            await service.runtime.cancel(remote.id);
            service.store.put("run", { ...local, state: "Cancelled" });
          }
        } catch {}
      }, 1500);
      try {
        await service.runtime.execute(remote.id);
        const local = service.store.get<Run>("run", remote.id)!;
        await call("/runner/checkpoint", { run: local });
      } finally {
        clearInterval(sync);
      }
    }
  } catch (e) {
    console.error(
      e instanceof Error ? e.message : "Runner connection unavailable",
    );
  }
  await new Promise((r) => setTimeout(r, 2000));
}
service.store.close();
