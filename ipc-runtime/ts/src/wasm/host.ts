import { WASI_NAMESPACE, createWasiImports } from "./wasi_shim.js";

/** What a module-specific host import gets to work with. */
export interface HostImportsContext {
  memory(): WebAssembly.Memory;
  readCString(ptr: number): string;
  readBytes(ptr: number, len: number): Uint8Array;
  logger(msg: string): void;
  /** Threads this instance may use: the engine's count on the main instance, 1 on a thread. */
  threads: number;
}

/**
 * Extra imports a particular module needs beyond WASI and wasi-threads, keyed by import module
 * then name (e.g. `{ env: { logstr: ptr => ... } }`). The FFI contract itself needs none; this
 * is the escape hatch for modules whose platform layer imports its own logging or abort hooks.
 */
export type HostImportsFactory = (
  ctx: HostImportsContext,
) => Record<string, Record<string, WebAssembly.ImportValue>>;

export interface InstanceOptions {
  module: WebAssembly.Module;
  memory: WebAssembly.Memory;
  /** WASI environ for the module (e.g. `HARDWARE_CONCURRENCY`). */
  env?: Record<string, string>;
  logger?: (msg: string) => void;
  hostImports?: HostImportsFactory;
  /**
   * wasi-threads `thread-spawn`: start the module's thread entry on another instance and return
   * its tid, or a negative errno when no thread can be started.
   */
  spawnThread?: (startArg: number) => number;
  /**
   * Export taking `(input, input_len, output_out, output_len_out)`. Default: the module's one
   * export named `<service>_ipc_ffi_entry` (or bare `ipc_ffi_entry`).
   */
  entry?: string;
  /**
   * Allocator export pairs to look for, in order of preference. Default: the entry's sibling
   * `<service>_ipc_ffi_alloc`/`_free`, then wasi-libc's `malloc`/`free`, then bb's `bbmalloc`/`bbfree`.
   */
  allocatorExports?: Array<[string, string]>;
  /** Call the reactor's `_initialize` after instantiation (main instances only). Default true. */
  runInitialize?: boolean;
  /** Threads this instance may use (reported to `hostImports`). Default 1. */
  threads?: number;
}

/** Every FFI entry export ends with this; the generated ones are prefixed by their service. */
export const ENTRY_SUFFIX = "ipc_ffi_entry";

/** Allocator pairs tried after the entry's own `<service>_ipc_ffi_alloc`/`_free`. */
export const FALLBACK_ALLOCATOR_EXPORTS: Array<[string, string]> = [
  ["malloc", "free"],
  ["bbmalloc", "bbfree"],
];

type WasmFn = (...args: number[]) => number;

/** The response pointer and length the entry writes back, ahead of the request in the scratch. */
const SLOTS_BYTES = 8;
/** Starting size of the request scratch; it grows to fit and never shrinks. */
const MIN_SCRATCH_BYTES = 64 * 1024;

/** The entry export to use and the service prefix it carries (`bb_` for `bb_ipc_ffi_entry`). */
function findEntry(
  exports: Record<string, WebAssembly.ExportValue>,
  wanted?: string,
): { entry: string; prefix: string } {
  const prefixOf = (name: string) =>
    name.endsWith(ENTRY_SUFFIX) ? name.slice(0, -ENTRY_SUFFIX.length) : "";
  if (wanted) {
    if (typeof exports[wanted] !== "function") {
      throw new Error(`wasm module does not export ${wanted}`);
    }
    return { entry: wanted, prefix: prefixOf(wanted) };
  }
  const candidates = Object.keys(exports).filter(
    (name) =>
      typeof exports[name] === "function" &&
      (name === ENTRY_SUFFIX || name.endsWith(`_${ENTRY_SUFFIX}`)),
  );
  if (candidates.length === 0) {
    throw new Error(`wasm module exports no FFI entry (*_${ENTRY_SUFFIX})`);
  }
  if (candidates.length > 1) {
    throw new Error(
      `wasm module exports several FFI entries (${candidates.join(", ")}); pass \`entry\``,
    );
  }
  return { entry: candidates[0], prefix: prefixOf(candidates[0]) };
}

/**
 * One instance of an FFI-contract module: imports resolved (WASI shim, wasi-threads, module
 * specific host imports), `_initialize` run, and the `<service>_ipc_ffi_entry` call protocol
 * implemented over the module's own allocator.
 */
export class WasmInstanceHost {
  private constructor(
    readonly instance: WebAssembly.Instance,
    readonly memory: WebAssembly.Memory,
    private readonly entry: WasmFn,
    private readonly alloc: WasmFn,
    private readonly free: WasmFn,
    readonly logger: (msg: string) => void,
  ) {}

  static async instantiate(opts: InstanceOptions): Promise<WasmInstanceHost> {
    const memory = opts.memory;
    const logger = opts.logger ?? (() => {});
    const ctx: HostImportsContext = {
      memory: () => memory,
      readBytes: (ptr, len) =>
        new Uint8Array(memory.buffer).slice(ptr >>> 0, (ptr >>> 0) + len),
      readCString: (ptr) => {
        const m = new Uint8Array(memory.buffer);
        let end = ptr >>> 0;
        while (m[end] !== 0) {
          end++;
        }
        return new TextDecoder().decode(m.slice(ptr >>> 0, end));
      },
      logger,
      threads: opts.threads ?? 1,
    };

    const imports: Record<string, Record<string, WebAssembly.ImportValue>> = {};
    for (const [ns, values] of Object.entries(opts.hostImports?.(ctx) ?? {})) {
      imports[ns] = { ...values };
    }
    imports.env = { ...(imports.env ?? {}), memory };
    imports[WASI_NAMESPACE] = {
      ...createWasiImports(opts.module, () => memory, {
        env: opts.env,
        onStderr: logger,
        onStdout: logger,
      }),
      ...(imports[WASI_NAMESPACE] ?? {}),
    };
    imports.wasi = {
      ...(imports.wasi ?? {}),
      "thread-spawn": (startArg: number) =>
        opts.spawnThread ? opts.spawnThread(startArg >>> 0) : -1,
    };

    const missing: string[] = [];
    for (const imp of WebAssembly.Module.imports(opts.module)) {
      if (imports[imp.module]?.[imp.name] !== undefined) {
        continue;
      }
      missing.push(`${imp.module}.${imp.name} (${imp.kind})`);
    }
    if (missing.length > 0) {
      throw new Error(
        `wasm module imports not provided by the host (supply them through hostImports): ${missing.join(", ")}`,
      );
    }

    const instance = await WebAssembly.instantiate(opts.module, imports);
    const exports = instance.exports as Record<string, WebAssembly.ExportValue>;
    if (
      opts.runInitialize !== false &&
      typeof exports._initialize === "function"
    ) {
      (exports._initialize as () => void)();
    }
    const { entry, prefix } = findEntry(exports, opts.entry);
    const allocatorExports = opts.allocatorExports ?? [
      [`${prefix}ipc_ffi_alloc`, `${prefix}ipc_ffi_free`],
      ...FALLBACK_ALLOCATOR_EXPORTS,
    ];
    const pair = allocatorExports.find(
      ([a, f]) =>
        typeof exports[a] === "function" && typeof exports[f] === "function",
    );
    if (!pair) {
      throw new Error(
        `wasm module exports no allocator pair (looked for ${allocatorExports
          .map(([a, f]) => `${a}/${f}`)
          .join(", ")})`,
      );
    }
    return new WasmInstanceHost(
      instance,
      memory,
      exports[entry] as WasmFn,
      exports[pair[0]] as WasmFn,
      exports[pair[1]] as WasmFn,
      logger,
    );
  }

  /** Call an arbitrary numeric export (used by thread workers for `wasi_thread_start`). */
  callExport(name: string, ...args: number[]): number {
    const fn = (
      this.instance.exports as Record<string, WebAssembly.ExportValue>
    )[name];
    if (typeof fn !== "function") {
      throw new Error(`wasm module does not export ${name}`);
    }
    return (fn as WasmFn)(...args);
  }

  /** Views over module memory, rebuilt only when a call grows it and detaches the old buffer. */
  private viewed?: ArrayBufferLike;
  private bytes!: Uint8Array;
  private words!: DataView;

  private refreshViews(): void {
    if (this.viewed !== this.memory.buffer) {
      this.viewed = this.memory.buffer;
      this.bytes = new Uint8Array(this.memory.buffer);
      this.words = new DataView(this.memory.buffer);
    }
  }

  /**
   * A buffer held across calls for the request and the two response slots, so a round trip costs
   * no allocator traffic of its own. It only ever grows, and calls are serialized (the entry is
   * synchronous and single-threaded), so one buffer is enough.
   */
  private scratch = 0;
  private scratchCapacity = 0;

  private reserveScratch(size: number): number {
    if (size <= this.scratchCapacity) {
      return this.scratch;
    }
    const capacity = Math.max(
      size,
      this.scratchCapacity * 2,
      MIN_SCRATCH_BYTES,
    );
    const scratch = this.alloc(capacity) >>> 0;
    if (scratch === 0) {
      throw new Error(
        `wasm module could not allocate a ${capacity} byte request buffer`,
      );
    }
    if (this.scratch !== 0) {
      this.free(this.scratch);
    }
    this.scratch = scratch;
    this.scratchCapacity = capacity;
    return scratch;
  }

  /**
   * One FFI round trip: request bytes in, a copy of the response bytes out. The request is placed
   * in module memory, and the response is read from where the module left it and released with the
   * module's own free, as the FFI contract requires.
   */
  call(input: Uint8Array): Uint8Array {
    const slots = this.reserveScratch(SLOTS_BYTES + input.length);
    const inPtr = slots + SLOTS_BYTES;
    let outPtr = 0;
    try {
      this.refreshViews();
      this.bytes.set(input, inPtr);
      this.words.setUint32(slots, 0, true);
      this.words.setUint32(slots + 4, 0, true);
      this.entry(inPtr, input.length, slots, slots + 4);
      // The call may have grown memory, detaching the buffer the views were built over.
      this.refreshViews();
      outPtr = this.words.getUint32(slots, true);
      const outLen = this.words.getUint32(slots + 4, true);
      return this.bytes.slice(outPtr, outPtr + outLen);
    } finally {
      if (outPtr !== 0) {
        this.free(outPtr);
      }
    }
  }
}
