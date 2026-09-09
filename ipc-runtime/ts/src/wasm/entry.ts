// What both platform entries (`index.node.ts`, `index.browser.ts`) share. They differ only in the
// platform they bind and in how they spawn a worker, so everything else lives here.
import {
  type WasmFfiBackendOptions,
  type WasmFfiBinding,
  type WasmFfiOptions,
  WasmFfiBackend,
  WasmFfiBackendSync,
} from "./backend.js";

export type { HostImportsContext, HostImportsFactory } from "./host.js";
export type { WasmModuleSource } from "./module_source.js";
export type { WasmPlatform, WorkerHandle, WorkerSide } from "./platform.js";
export type { WasmFfiBackendOptions, WasmFfiBinding, WasmFfiOptions };
export {
  WasmFfiBackend,
  WasmFfiBackendSync,
  WasmFfiEngine,
} from "./backend.js";
export { compileWasmModule } from "./module_source.js";
export { WasmExitError } from "./wasi_shim.js";
export { runMainWorker } from "./main_worker.js";
export { runThreadWorker } from "./thread_worker.js";

export interface WasmEntry {
  createWasmFfiBackend(opts: WasmFfiBackendOptions): Promise<WasmFfiBackend>;
  createWasmFfiBackendSync(opts: WasmFfiOptions): Promise<WasmFfiBackendSync>;
  /** Whether this platform can run a module's threads build (a shared memory is available). */
  sharedMemoryAvailable(): boolean;
}

/** The entry points a platform offers, over the workers and platform it binds. */
export function bindEntry(binding: WasmFfiBinding): WasmEntry {
  return {
    createWasmFfiBackend: (opts) => WasmFfiBackend.create(opts, binding),
    createWasmFfiBackendSync: (opts) =>
      WasmFfiBackendSync.create(opts, binding),
    sharedMemoryAvailable: () => binding.platform.sharedMemoryAvailable(),
  };
}
