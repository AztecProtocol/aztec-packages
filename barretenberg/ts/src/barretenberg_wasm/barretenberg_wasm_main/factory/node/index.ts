/**
 * Spawn a Node worker_thread that hosts a `BarretenbergWasmMain` instance.
 * Used by `BarretenbergWasmAsyncBackend` when `useWorker: true` so that
 * synchronous wasm calls do not block the host main thread.
 *
 * The worker itself loads the Emscripten glue (which manages its own
 * pthread pool internally). Calls into the worker are proxied via comlink.
 */

import { Worker } from 'worker_threads';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

function getCurrentDir(): string {
  if (typeof __dirname !== 'undefined') {
    return __dirname;
  }
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - ESM-only API.
  return dirname(fileURLToPath(import.meta.url));
}

export function createMainWorker(): Promise<Worker> {
  const here = getCurrentDir();
  const worker = new Worker(`${here}/main.worker.js`);
  return Promise.resolve(worker);
}
