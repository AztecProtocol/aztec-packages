// Browser entry of the wasm FFI backend (`@aztec-foundation/ipc-runtime/wasm`, `browser` condition).
import {
  type WasmFfiBackendOptions,
  type WasmFfiBinding,
  type WasmFfiOptions,
  WasmFfiBackend,
  WasmFfiBackendSync,
  WasmFfiEngine,
} from "./backend.js";
import {
  browserPlatform,
  browserWorkerHandle,
  browserWorkerSide,
} from "./platform.browser.js";

export type { HostImportsContext, HostImportsFactory } from "./host.js";
export type { WasmModuleSource } from "./module_source.js";
export type { WasmPlatform, WorkerHandle, WorkerSide } from "./platform.js";
export type { WasmFfiBackendOptions, WasmFfiBinding, WasmFfiOptions };
export { WasmFfiBackend, WasmFfiBackendSync, WasmFfiEngine };
export { compileWasmModule } from "./module_source.js";
export { WasmExitError } from "./wasi_shim.js";
export { runMainWorker } from "./main_worker.js";
export { runThreadWorker } from "./thread_worker.js";
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

export function createWasmFfiBackend(
  opts: WasmFfiBackendOptions,
): Promise<WasmFfiBackend> {
  return WasmFfiBackend.create(opts, binding);
}

export function createWasmFfiBackendSync(
  opts: WasmFfiOptions,
): Promise<WasmFfiBackendSync> {
  return WasmFfiBackendSync.create(opts, binding);
}

/** Threads need `SharedArrayBuffer`, which browsers expose only under COOP/COEP headers. */
export function sharedMemoryAvailable(): boolean {
  return browserPlatform.sharedMemoryAvailable();
}
