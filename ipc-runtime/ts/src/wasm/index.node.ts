// Node entry of the wasm FFI backend (`@aztec-foundation/ipc-runtime/wasm`, `default` condition).
import {
  type WasmFfiBackendOptions,
  type WasmFfiBinding,
  type WasmFfiOptions,
  WasmFfiBackend,
  WasmFfiBackendSync,
  WasmFfiEngine,
} from "./backend.js";
import {
  nodePlatform,
  nodeWorkerHandle,
  nodeWorkerSide,
} from "./platform.node.js";

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

/** Whether this platform can run the module's threads build (a shared memory is available). */
export function sharedMemoryAvailable(): boolean {
  return nodePlatform.sharedMemoryAvailable();
}
