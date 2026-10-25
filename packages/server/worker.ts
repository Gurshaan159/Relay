import { Store } from "../shared-runtime/store";
import { Service } from "../shared-runtime/service";
import { hostedVault } from "../shared-runtime/vault";
const store = new Store();
const service = new Service(
  store,
  process.env.RELAY_LOCATION || "hosted",
  hostedVault(store.root),
);
service.start();
console.log(`Relay ${service.location} worker ready`);
async function stop() {
  await service.close();
  service.store.close();
  process.exit();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
process.on('message',message=>{if(message==='shutdown')void stop()});
