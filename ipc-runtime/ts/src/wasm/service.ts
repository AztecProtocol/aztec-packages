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

// (module (func (param i64) (result i64) local.get 0 local.get 0 i64.mul_wide_u drop)): it
// validates exactly where the engine has the wide-arithmetic proposal (i64.mul_wide_u = 0xfc 0x16).
const WIDE_PROBE = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 6, 1, 96, 1, 126, 1, 126, 3, 2, 1, 0, 10, 11, 1, 9, 0, 32, 0, 32, 0,
  252, 22, 26, 11,
]);
let wideArithmetic: boolean | undefined;

/**
 * Which of a package's own modules to run: the threads build for more than one thread, otherwise
 * the single-thread build. Each stands in for the other when a package ships only one, and a
 * wide-arithmetic build replaces its counterpart where the engine supports the proposal.
 */
export function chooseWasmModule(
  modules: { single?: URL; threads?: URL; wideSingle?: URL; wideThreads?: URL },
  label: string,
  threads: number,
): URL {
  const wide =
    (modules.wideSingle || modules.wideThreads) &&
    (wideArithmetic ??= WebAssembly.validate(WIDE_PROBE));
  const single = (wide && modules.wideSingle) || modules.single;
  const multi = (wide && modules.wideThreads) || modules.threads;
  const module = threads > 1 ? (multi ?? single) : (single ?? multi);
  if (!module) {
    throw new Error(`${label}: no wasm module ships with this package`);
  }
  return module;
}
