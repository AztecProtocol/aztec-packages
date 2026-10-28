// Default main-instance worker for node: hosts wasm modules, their thread pools and napi addon
// instances off the caller's thread.
import { runMainWorker } from "../main_worker.js";
import { nodePlatform, nodeWorkerSide } from "./platform.js";
import { loadNapiFfiAddon } from "../../napi_ffi.js";

runMainWorker(nodeWorkerSide(), nodePlatform, {
  createThreadWorker: () =>
    nodePlatform.createWorker(
      new URL("./thread.worker.node.js", import.meta.url),
    ),
  loadNapi: (addonPath, hostCall) => {
    const addon = loadNapiFfiAddon(addonPath);
    if (!addon.create) {
      throw new Error(`${addonPath}: the addon has no instances (create)`);
    }
    const instance = addon.create();
    return {
      call: (input) => addon.callInstance!(instance, input, hostCall),
      destroy: () => addon.destroy!(instance),
    };
  },
});
