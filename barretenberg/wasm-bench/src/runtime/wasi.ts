/**
 * Minimal WASI + bb env imports for the wasm bb binary.
 *
 * Forked-down version of `barretenberg/ts/src/barretenberg_wasm/barretenberg_wasm_base`,
 * stripped of the bb.js Comlink/heap-allocator layers. The wasm binary itself supplies
 * stubs for almost every WASI call (see `barretenberg/cpp/src/barretenberg/wasi/wasi_stubs.cpp`);
 * the JS side only has to provide `random_get` + `clock_time_get`, an `env.logstr` for the
 * `info()` macro, and a thread-spawn hook on the main side.
 *
 * Keep this dependency-free so it can be reused by a Node test wrapper.
 */

export interface WasiBindings {
  memory: WebAssembly.Memory;
  getMemoryBytes(): Uint8Array;
  logger: (msg: string) => void;
}

function readNullTerminatedAscii(mem: Uint8Array, addr: number): string {
  let end = addr;
  while (end < mem.length && mem[end] !== 0) end++;
  // TextDecoder refuses SharedArrayBuffer-backed views, so copy into a regular Uint8Array first.
  return new TextDecoder('ascii').decode(mem.slice(addr, end));
}

function buildBaseImports(b: WasiBindings) {
  /* eslint-disable @typescript-eslint/naming-convention */
  return {
    wasi_snapshot_preview1: {
      random_get: (outPtr: number, length: number) => {
        const out = outPtr >>> 0;
        const buf = new Uint8Array(length);
        crypto.getRandomValues(buf);
        b.getMemoryBytes().set(buf, out);
        return 0;
      },
      clock_time_get: (_id: number, _precision: bigint, outPtr: number) => {
        const out = outPtr >>> 0;
        // Wall-clock time in ns since Unix epoch, computed as performance.timeOrigin +
        // performance.now(). performance.now() alone is each Worker's own time-since-spawn,
        // so sub-worker clocks lag the main wasm thread's clock by the spawn delay; that
        // skew pushes the main wasm thread's events later in the rebased trace than its
        // sub-workers'. Wall-clock time is the same across every Worker in the page so
        // BB_BENCH per-call event timestamps line up across threads.
        //
        // Precision: timeOrigin (~1.7e12 ms in 2026) + now() (< 1e5 ms in a bench run)
        // multiplied by 1000 (µs) is < 2e15, well below Number's 2^53 = 9.007e15 integer
        // ceiling, so Math.floor(...) is exact. The * 1000n bigint multiply lifts µs to
        // ns without precision loss. performance.now() has ~5 µs floor in COI'd Chrome,
        // so we expose that resolution; the trailing zero ns digits are honest.
        const wallUs = Math.floor((performance.timeOrigin + performance.now()) * 1000);
        const ns = BigInt(wallUs) * 1000n;
        new DataView(b.memory.buffer).setBigUint64(out, ns, true);
        return 0;
      },
      proc_exit: (code: number) => {
        b.logger(`PANIC: proc_exit(${code}) called`);
        throw new Error(`proc_exit(${code})`);
      },
    },
    env: {
      logstr: (addr: number) => {
        const str = readNullTerminatedAscii(b.getMemoryBytes(), addr >>> 0);
        const mib = (b.memory.buffer.byteLength / (1024 * 1024)).toFixed(2);
        b.logger(`${str} (mem: ${mib}MiB)`);
      },
      throw_or_abort_impl: (addr: number) => {
        const str = readNullTerminatedAscii(b.getMemoryBytes(), addr >>> 0);
        throw new Error(str);
      },
      memory: b.memory,
    },
  };
  /* eslint-enable @typescript-eslint/naming-convention */
}

/**
 * Imports for the **main** wasm instance. Adds `wasi.thread-spawn` (which calls back into
 * `onThreadSpawn(tid, arg)` so the JS side can pick a worker and dispatch `wasi_thread_start`)
 * and `env.env_hardware_concurrency` which reports the number of workers we actually have.
 */
export function buildMainImports(b: WasiBindings, opts: {
  onThreadSpawn: (arg: number) => number;
  reportedThreads: number;
}) {
  const base = buildBaseImports(b);
  /* eslint-disable @typescript-eslint/naming-convention */
  return {
    ...base,
    wasi: {
      'thread-spawn': (arg: number) => opts.onThreadSpawn(arg >>> 0),
    },
    env: {
      ...base.env,
      env_hardware_concurrency: () => opts.reportedThreads,
    },
  };
  /* eslint-enable @typescript-eslint/naming-convention */
}

/**
 * Imports for a **worker** wasm instance. Threads cannot spawn threads (the C++ side never
 * tries, but we keep the import so the import schema matches the main side). Hardware
 * concurrency reported as 1 so any worker-local fallback path doesn't try to fan out further.
 */
export function buildWorkerImports(b: WasiBindings) {
  const base = buildBaseImports(b);
  /* eslint-disable @typescript-eslint/naming-convention */
  return {
    ...base,
    wasi: {
      'thread-spawn': () => {
        b.logger('PANIC: worker tried to spawn a thread');
        throw new Error('nested thread-spawn');
      },
    },
    env: {
      ...base.env,
      env_hardware_concurrency: () => 1,
    },
  };
  /* eslint-enable @typescript-eslint/naming-convention */
}
