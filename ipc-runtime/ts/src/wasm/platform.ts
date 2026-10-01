import type { ModuleLoadPlatform } from "./module_source.js";

/** The parent's handle on a spawned worker (node `worker_threads` or a browser `Worker`). */
export interface WorkerHandle {
  postMessage(message: unknown, transfer?: ArrayBuffer[]): void;
  onMessage(handler: (message: any) => void): void;
  onError(handler: (error: unknown) => void): void;
  terminate(): Promise<void>;
  /** Let the host process exit even while this worker is alive (node only; no-op elsewhere). */
  unref(): void;
}

/** What the wasm backend needs from its environment; one implementation per platform. */
export interface WasmPlatform extends ModuleLoadPlatform {
  createWorker(url: URL): WorkerHandle;
  hardwareConcurrency(): number;
  /** Threads need a shared memory; browsers only allow one under COOP/COEP. */
  sharedMemoryAvailable(): boolean;
  /** Upper bound on linear memory (64 KiB pages) to ask for when the caller sets none. */
  maximumMemoryPages?(): number;
}

/** The worker's view of its parent (node `parentPort` or a browser worker global). */
export interface WorkerSide {
  onMessage(handler: (message: any) => void): void;
  postMessage(message: unknown, transfer?: ArrayBuffer[]): void;
  close(): void;
}
