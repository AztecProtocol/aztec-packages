// Default main-instance worker for node: hosts wasm modules, their thread pools and instances of
// services' shared libraries off the caller's thread.
import { runMainWorker } from "../main_worker.js";
import { nodePlatform, nodeWorkerSide } from "./platform.js";
import { loadNapiFfiLibrary } from "../../napi_ffi.js";

runMainWorker(nodeWorkerSide(), nodePlatform, {
  createThreadWorker: () =>
    nodePlatform.createWorker(
      new URL("./thread.worker.js", import.meta.url),
    ),
  loadNapi: ({ libraryPath, ffiName }, hostCall) => {
    const library = loadNapiFfiLibrary(libraryPath, ffiName);
    const instance = library.createInstance();
    const call = (input: Uint8Array) =>
      library.callInstance(instance, input, hostCall);
    return {
      call,
      callSync: call,
      destroy: () => library.destroyInstance(instance),
    };
  },
});
