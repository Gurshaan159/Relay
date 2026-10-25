import { Store } from "../shared-runtime/store";
import { Service } from "../shared-runtime/service";
import { serve } from "./http";
import { hostedVault } from "../shared-runtime/vault";
const store = new Store();
const service = new Service(store, "hosted", hostedVault(store.root));
const server = serve(service, Number(process.env.RELAY_PORT || 4320));
console.log(
  "Relay authenticated API listening. Start the separate worker to execute hosted runs.",
);
async function stop() {
  server.close();
  await service.close();
  service.store.close();
  process.exit();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
