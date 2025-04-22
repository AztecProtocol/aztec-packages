import createDebug from 'debug';
import { getSharedMemoryAvailable } from './helpers/node/index.js';
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
