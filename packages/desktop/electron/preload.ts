import { contextBridge, ipcRenderer } from "electron";
import type { RelayBridge } from "../../shared-runtime/schema";
const bridge: RelayBridge = {
  request: (request) => ipcRenderer.invoke("relay:request", request),
  switchEmployee: (id) => ipcRenderer.invoke("relay:switch", id),
};
contextBridge.exposeInMainWorld("relay", bridge);
