import { getSharedMemoryAvailable, getAvailableThreads } from './helpers/node/index.js';
import { fetchCode } from './fetch_code/index.js';
import { createDebugLogger } from '../log/index.js';

export async function fetchModuleAndThreads(
  desiredThreads = 32,
  wasmPath?: string,
  logger: (msg: string) => void = createDebugLogger('fetch_mat'),
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
