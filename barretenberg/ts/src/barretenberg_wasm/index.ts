import { proxy } from 'comlink';
import createDebug from 'debug';
import { createMainWorker } from './barretenberg_wasm_main/factory/node/index.js';
import { getRemoteBarretenbergWasm, getSharedMemoryAvailable } from './helpers/node/index.js';
import { BarretenbergWasmMain, BarretenbergWasmMainWorker } from './barretenberg_wasm_main/index.js';
import { fetchCode } from './fetch_code/index.js';

const debug = createDebug('bb.js:wasm');

export async function fetchModule(threads?: number) {
  const shared = getSharedMemoryAvailable();
  if (!shared) {
    if (!threads) {
      threads = 1;
    } else if (threads > 1) {
      throw new Error('Cannot request > 1 thread when no shared memory available.');
    }
  }
  const code = await fetchCode(shared);
  const module = await WebAssembly.compile(code);
  return module;
}

export class BarretenbergWasm extends BarretenbergWasmMain {
  /**
   * Construct and initialize BarretenbergWasm within a Worker. Return both the worker and the wasm proxy.
   * Used when running in the browser, because we can't block the main thread.
   */
  public static async new(threads?: number) {
    const worker = createMainWorker();
    const wasm = getRemoteBarretenbergWasm<BarretenbergWasmMainWorker>(worker);
    const module = await fetchModule(threads);
    await wasm.init(module, threads, proxy(debug));
    return { worker, wasm };
  }
}

export type BarretenbergWasmWorker = BarretenbergWasmMainWorker;
