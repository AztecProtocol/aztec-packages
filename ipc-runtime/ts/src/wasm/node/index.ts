// Node entry of the wasm FFI backend (`@aztec-foundation/ipc-runtime/wasm`, `default` condition).
import { type WasmFfiBinding, bindEntry } from "../entry.js";
import {
  nodePlatform,
  nodeWorkerHandle,
  nodeWorkerSide,
} from "./platform.js";

export * from "../entry.js";
export {
  nodePlatform as platform,
  nodeWorkerHandle as workerHandle,
  nodeWorkerSide as workerSide,
};

/** The worker scripts the node entry spawns for the main instance and each wasi thread. */
export const binding: WasmFfiBinding = {
  platform: nodePlatform,
  createThreadWorker: () =>
    nodePlatform.createWorker(
      new URL("./thread.worker.js", import.meta.url),
    ),
  createMainWorker: () =>
    nodePlatform.createWorker(
      new URL("./main.worker.js", import.meta.url),
    ),
};

export const {
  createWasmFfiBackend,
  createWasmFfiBackendSync,
  sharedMemoryAvailable,
} = bindEntry(binding);
