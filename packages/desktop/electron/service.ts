import { parentPort } from "node:worker_threads";
import { Store } from "../../shared-runtime/store";
import { Service } from "../../shared-runtime/service";
import { serve } from "../../server/http";
const pending = new Map<
  string,
  { resolve: (v: any) => void; reject: (e: any) => void }
>();
let sequence = 0;
const secret = (action: string, id: string, value?: string) =>
  new Promise<string>((resolve, reject) => {
    const requestId = String(++sequence);
    pending.set(requestId, { resolve, reject });
    parentPort!.postMessage({ secret: action, requestId, id, value });
  });
const service = new Service(new Store(), "local", {
  set: async (id, value) => {
    await secret("set", id, value);
  },
  get: (id) => secret("get", id),
});
service.start();
service.recorder.onFinished = () =>
  parentPort!.postMessage({ recordingFinished: true });
const server = serve(service, 4319, true);
server.on("error", (e) =>
  console.error("Recorder bridge unavailable:", e.message),
);
parentPort!.on("message", async (message) => {
  if (message.secretResult) {
    const p = pending.get(message.requestId);
    pending.delete(message.requestId);
    message.error ? p?.reject(Error(message.error)) : p?.resolve(message.value);
    return;
  }
  try {
    if (message.close) {
      await service.close();
      server.close();
      parentPort!.postMessage({ closed: true });
      return;
    }
    const value = await service.request(message.owner, message.request);
    parentPort!.postMessage({ id: message.id, value });
  } catch (e) {
    parentPort!.postMessage({
      id: message.id,
      error: e instanceof Error ? e.message : "Request failed",
    });
  }
});
