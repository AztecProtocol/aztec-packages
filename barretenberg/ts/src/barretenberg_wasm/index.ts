import { proxy } from 'comlink';
import createDebug from 'debug';
import { createMainWorker } from './barretenberg_wasm_main/factory/node/index.js';
import { getRemoteBarretenbergWasm, getSharedMemoryAvailable } from './helpers/node/index.js';
import { BarretenbergWasmMain, BarretenbergWasmMainWorker } from './barretenberg_wasm_main/index.js';
import { fetchCode } from './fetch_code/index.js';

export async function fetchModuleAndThreads(
  desiredThreads = 32,
  wasmPath?: string,
  logger: (msg: string) => void = createDebug('bb.js:fetch_mat'),
) {
  const shared = getSharedMemoryAvailable();

  const availableThreads = shared ? await getAvailableThreads(logger) : 1;
  // We limit the number of threads to 32 as we do not benefit from greater numbers.
  const limitedThreads = Math.min(desiredThreads, availableThreads, 32);

  logger(`Fetching bb wasm from ${wasmPath ?? 'default location'}`);
  const code = await fetchCode(shared, wasmPath);
  logger(`Compiling bb wasm of ${code.byteLength} bytes`);
  const module = await WebAssembly.compile(code);
  logger('Compilation of bb wasm complete');
  return { module, threads: limitedThreads };
}

async function getAvailableThreads(logger: (msg: string) => void): Promise<number> {
  if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) {
    return navigator.hardwareConcurrency;
  } else {
    try {
      const os = await import('os');
      return os.cpus().length;
    } catch (e: any) {
      logger(
        `Could not detect environment to query number of threads. Falling back to one thread. Error: ${e.message ?? e}`,
      );
      return 1;
    }
  }
}

export class BarretenbergWasm extends BarretenbergWasmMain {
  /**
   * Construct and initialize BarretenbergWasm within a Worker. Return both the worker and the wasm proxy.
   * Used when running in the browser, because we can't block the main thread.
   */
  public static async new(
    desiredThreads?: number,
    wasmPath?: string,
    logger: (msg: string) => void = createDebug('bb.js:bb_wasm_main'),
  ) {
    const worker = createMainWorker();
    const wasm = getRemoteBarretenbergWasm<BarretenbergWasmMainWorker>(worker);
    const { module, threads } = await fetchModuleAndThreads(desiredThreads, wasmPath, logger);
    await wasm.init(module, threads, proxy(logger));
    return { worker, wasm };
  }
}

export type BarretenbergWasmWorker = BarretenbergWasmMainWorker;
