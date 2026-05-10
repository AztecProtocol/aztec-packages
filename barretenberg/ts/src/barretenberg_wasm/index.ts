/**
 * Compatibility shim for `fetchModuleAndThreads`.
 *
 * The previous wasm runtime needed bb.js to fetch + compile the wasm module
 * itself before handing it to the worker harness. Under the Emscripten
 * loader, the JS glue compiles its own bundled wasm during `await
 * createBarretenbergModule(...)`, so all we need to do here is decide a
 * thread count.
 *
 * The returned `module` slot is `undefined` -- callers must continue to pass
 * it to `BarretenbergWasmMain.init` (which now ignores it). Keeping the
 * shape stable avoids churn in `wasm.ts` and in test code that destructures
 * `{ module, threads }`.
 */
import { getAvailableThreads, getSharedMemoryAvailable } from './helpers/index.js';

export async function fetchModuleAndThreads(
  desiredThreads = 32,
  _wasmPath?: string,
  logger: (msg: string) => void = () => {},
): Promise<{ module: undefined; threads: number }> {
  const shared = getSharedMemoryAvailable();
  const availableThreads = shared ? await getAvailableThreads(logger) : 1;
  // We limit the number of threads to 32 as we do not benefit from greater numbers.
  const threads = Math.min(desiredThreads, availableThreads, 32);
  return { module: undefined, threads };
}
