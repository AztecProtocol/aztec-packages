// Browser entry of the wasm FFI backend (`@aztec-foundation/ipc-runtime/wasm`, `browser` condition).
import { type WasmFfiBinding, bindEntry } from "../entry.js";
import {
  browserPlatform,
  browserWorkerHandle,
  browserWorkerSide,
} from "./platform.js";

export * from "../entry.js";
export {
  browserPlatform as platform,
  browserWorkerHandle as workerHandle,
  browserWorkerSide as workerSide,
};

/**
 * The runtime's own worker scripts, spawned with the literal expression bundlers detect so they
 * are emitted as worker chunks. A package whose module needs `hostImports` points at its own.
 */
export const binding: WasmFfiBinding = {
  platform: browserPlatform,
  createThreadWorker: () =>
    browserWorkerHandle(
      new Worker(new URL("./thread.worker.browser.js", import.meta.url), {
        type: "module",
      }),
    ),
  createMainWorker: () =>
    browserWorkerHandle(
      new Worker(new URL("./main.worker.browser.js", import.meta.url), {
        type: "module",
      }),
    ),
};

export const {
  createWasmFfiBackend,
  createWasmFfiBackendSync,
  sharedMemoryAvailable,
} = bindEntry(binding);
