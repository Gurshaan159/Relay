import { contextBridge, ipcRenderer } from "electron";
import type { RelayBridge } from "../../shared-runtime/schema";
// Electron prefixes errors thrown by main-process handlers with
// "Error invoking remote method '<channel>': Error: ". Show the service's own message.
const invoke = (channel: string, value: unknown) =>
  ipcRenderer.invoke(channel, value).catch((e: Error) => {
    throw Error(
      String(e?.message ?? e).replace(
        /^Error invoking remote method '[^']+': (?:Error: )?/,
        "",
      ),
    );
  });
const bridge: RelayBridge = {
  request: (request) => invoke("relay:request", request),
  switchEmployee: (id) => invoke("relay:switch", id),
};
contextBridge.exposeInMainWorld("relay", bridge);
