import type { WasmPlatform, WorkerHandle, WorkerSide } from "../platform.js";

/** The parent's handle on a browser `Worker`. */
export function browserWorkerHandle(worker: Worker): WorkerHandle {
  return {
    postMessage: (message, transfer) =>
      worker.postMessage(message, transfer ?? []),
    onMessage: (handler) =>
      worker.addEventListener("message", (e) => handler(e.data)),
    onError: (handler) => worker.addEventListener("error", (e) => handler(e)),
    terminate: async () => worker.terminate(),
    unref: () => {},
  };
}

export const browserPlatform: WasmPlatform = {
  // For scripts served as-is. Bundled code must spawn its workers with the literal
  // `new Worker(new URL('./x.js', import.meta.url), { type: 'module' })` and wrap them with
  // `browserWorkerHandle` (see `WasmFfiBinding`).
  createWorker: (url: URL) =>
    browserWorkerHandle(new Worker(url, { type: "module" })),
  hardwareConcurrency: () => navigator.hardwareConcurrency || 1,
  sharedMemoryAvailable: () =>
    typeof SharedArrayBuffer !== "undefined" &&
    (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated ===
      true,
  // iOS browsers kill a page well before it reaches the 4 GiB a wasm memory may declare; asking
  // for a 1 GiB maximum keeps the reservation within what they grant.
  maximumMemoryPages: () =>
    typeof navigator !== "undefined" && /iPad|iPhone/.test(navigator.userAgent)
      ? 2 ** 14
      : 2 ** 16,
};

/** The worker's side of a browser `Worker` channel. */
export function browserWorkerSide(): WorkerSide {
  const scope = globalThis as unknown as {
    addEventListener(type: "message", handler: (e: MessageEvent) => void): void;
    postMessage(message: unknown, transfer?: Transferable[]): void;
    close(): void;
  };
  return {
    onMessage: (handler) =>
      scope.addEventListener("message", (e) => handler(e.data)),
    postMessage: (message, transfer) =>
      scope.postMessage(message, transfer ?? []),
    close: () => scope.close(),
  };
}
