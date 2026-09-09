// Node entry of the wasm FFI backend (`@aztec-foundation/ipc-runtime/wasm`, `default` condition).
import { type WasmFfiBinding, bindEntry } from "./entry.js";
import {
  nodePlatform,
  nodeWorkerHandle,
  nodeWorkerSide,
} from "./platform.node.js";

export * from "./entry.js";
export {
  nodePlatform as platform,
  nodeWorkerHandle as workerHandle,
  nodeWorkerSide as workerSide,
};

/** The runtime's own worker scripts; a package whose module needs `hostImports` points at its own. */
export const binding: WasmFfiBinding = {
  platform: nodePlatform,
  createThreadWorker: () =>
    nodePlatform.createWorker(
      new URL("./thread.worker.node.js", import.meta.url),
    ),
  createMainWorker: () =>
    nodePlatform.createWorker(
      new URL("./main.worker.node.js", import.meta.url),
    ),
};

export const {
  createWasmFfiBackend,
  createWasmFfiBackendSync,
  sharedMemoryAvailable,
} = bindEntry(binding);
