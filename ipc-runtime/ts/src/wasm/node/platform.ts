import { readFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker, type MessagePort, parentPort } from "node:worker_threads";
import type { WasmPlatform, WorkerHandle, WorkerSide } from "../platform.js";

/** The parent's handle on a `worker_threads` worker. */
export function nodeWorkerHandle(worker: Worker): WorkerHandle {
  return {
    postMessage: (message, transfer) =>
      worker.postMessage(
        message,
        transfer as unknown as readonly import("node:worker_threads").TransferListItem[],
      ),
    onMessage: (handler) => {
      worker.on("message", handler);
    },
    onError: (handler) => {
      worker.on("error", handler);
    },
    terminate: async () => {
      await worker.terminate();
    },
    unref: () => worker.unref(),
  };
}

export const nodePlatform: WasmPlatform = {
  readFile: async (url) => new Uint8Array(await readFile(fileURLToPath(url))),
  resolvePath: (path) => pathToFileURL(path),
  createWorker: (url: URL) => nodeWorkerHandle(new Worker(url)),
  hardwareConcurrency: () =>
    Number(process.env.HARDWARE_CONCURRENCY) || availableParallelism(),
  sharedMemoryAvailable: () => true,
};

/** The worker's side of a node `worker_threads` channel. */
export function nodeWorkerSide(
  port: MessagePort | null = parentPort,
): WorkerSide {
  if (!port) {
    throw new Error(
      "nodeWorkerSide: not running inside a worker (no parentPort)",
    );
  }
  return {
    onMessage: (handler) => {
      port.on("message", handler);
    },
    postMessage: (message, transfer) =>
      port.postMessage(
        message,
        transfer as unknown as readonly import("node:worker_threads").TransferListItem[],
      ),
    close: () => port.close(),
  };
}
