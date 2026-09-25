import { MAX_THREADS } from "./backend.js";
import type { WasmPlatform } from "./platform.js";

/**
 * How many threads to run a module with: the platform's parallelism when the caller named none,
 * else the number asked for, checked against what this host can actually give. More than one
 * thread needs a shared memory, which browsers only allow on a cross-origin isolated page, and
 * asking for it where it cannot be had is an error rather than a silent downgrade.
 */
export function resolveWasmThreads(
  platform: WasmPlatform,
  label: string,
  threads?: number,
): number {
  if (threads === undefined) {
    return platform.sharedMemoryAvailable()
      ? Math.min(platform.hardwareConcurrency(), MAX_THREADS)
      : 1;
  }
  if (threads > 1 && !platform.sharedMemoryAvailable()) {
    throw new Error(
      `${label}: ${threads} threads requested but no shared memory is available here ` +
        "(browsers need a cross-origin isolated page: COOP/COEP headers); pass threads: 1",
    );
  }
  return threads;
}

/**
 * Which of a package's own modules to run: the threads build for more than one thread, otherwise
 * the single-thread build. Each stands in for the other when a package ships only one.
 */
export function chooseWasmModule(
  modules: { single?: URL; threads?: URL },
  label: string,
  threads: number,
): URL {
  const module =
    threads > 1
      ? (modules.threads ?? modules.single)
      : (modules.single ?? modules.threads);
  if (!module) {
    throw new Error(`${label}: no wasm module ships with this package`);
  }
  return module;
}
