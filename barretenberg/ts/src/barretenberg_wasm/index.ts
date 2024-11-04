import { proxy } from 'comlink';
import createDebug from 'debug';
import { createMainWorker } from './barretenberg_wasm_main/factory/node/index.js';
import { getRemoteBarretenbergWasm, getSharedMemoryAvailable } from './helpers/node/index.js';
import { BarretenbergWasmMain, BarretenbergWasmMainWorker } from './barretenberg_wasm_main/index.js';
import { fetchCode } from './fetch_code/index.js';

const debug = createDebug('bb.js:wasm');

export async function fetchModuleAndThreads(desiredThreads = 32) {
  const shared = getSharedMemoryAvailable();

  const availableThreads = shared ? await getAvailableThreads() : 1;
  // We limit the number of threads to 32 as we do not benefit from greater numbers.
  const limitedThreads = Math.min(desiredThreads, availableThreads, 32);

  const code = await fetchCode(shared);
  const module = await WebAssembly.compile(code);
  return { module, threads: limitedThreads };
}

async function getAvailableThreads(): Promise<number> {
  if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) {
    return navigator.hardwareConcurrency;
  } else {
    try {
      const os = await import('os');
      return os.cpus().length;
    } catch (e) {
      debug(`Could not detect environment. Falling back to one thread.: {e}`);
      return 1;
    }
  }
}

export class BarretenbergWasm extends BarretenbergWasmMain {
  /**
   * Construct and initialize BarretenbergWasm within a Worker. Return both the worker and the wasm proxy.
   * Used when running in the browser, because we can't block the main thread.
   */
  public static async new(desiredThreads?: number) {
    const worker = createMainWorker();
    const wasm = getRemoteBarretenbergWasm<BarretenbergWasmMainWorker>(worker);
    const { module, threads } = await fetchModuleAndThreads(desiredThreads);
    await wasm.init(module, threads, proxy(debug));
    return { worker, wasm };
  }
}

export type BarretenbergWasmWorker = BarretenbergWasmMainWorker;
