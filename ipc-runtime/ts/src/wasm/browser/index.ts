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
 * The worker scripts spawned for the main instance and each wasi thread, with the literal
 * expression bundlers detect so they are emitted as worker chunks of the consuming application.
 */
export const binding: WasmFfiBinding = {
  platform: browserPlatform,
  createThreadWorker: () =>
    browserWorkerHandle(
      new Worker(new URL("./thread.worker.js", import.meta.url), {
        type: "module",
      }),
    ),
  createMainWorker: () =>
    browserWorkerHandle(
      new Worker(new URL("./main.worker.js", import.meta.url), {
        type: "module",
      }),
    ),
};

export const {
  createWasmFfiBackend,
  createWasmFfiBackendSync,
  sharedMemoryAvailable,
} = bindEntry(binding);
