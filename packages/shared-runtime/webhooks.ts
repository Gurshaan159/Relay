import { createHmac } from "node:crypto";
import type { Store } from "./store";
import type { Run } from "./schema";
export async function deliverWebhooks(store: Store) {
  const endpoint = process.env.RELAY_WEBHOOK_URL;
  const secret = process.env.RELAY_WEBHOOK_SECRET;
  if (!endpoint || !secret) return;
  const url = new URL(endpoint);
  if (
    url.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(url.hostname)
  )
    return;
  for (const run of store
    .all<Run>("run")
    .filter((r) => ["Completed", "Failed", "Cancelled"].includes(r.state))) {
    const id = `webhook:${run.id}`;
    const delivery = store.get("delivery", id) || { id, attempts: 0, next: 0 };
    if (delivery.done || delivery.attempts >= 5 || delivery.next > Date.now())
      continue;
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const body = JSON.stringify({
      event: "run.finished",
      runId: run.id,
      agentId: run.agentId,
      state: run.state,
    });
    const signature = createHmac("sha256", secret)
      .update(timestamp + "." + body)
      .digest("hex");
    delivery.attempts++;
    delivery.next =
      Date.now() + Math.min(3600000, 1000 * 2 ** delivery.attempts);
    store.put("delivery", delivery);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Relay-Timestamp": timestamp,
          "Relay-Signature": `sha256=${signature}`,
          "Relay-Delivery": run.id,
        },
        body,
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      });
      if (response.ok) store.put("delivery", { ...delivery, done: true });
    } catch {}
  }
}
