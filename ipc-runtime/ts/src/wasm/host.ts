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
  /** Export taking `(input, input_len, output_out, output_len_out)`; default `ipc_ffi_entry`. */
  entry?: string;
  /** Allocator export pairs to look for, in order of preference. */
  allocatorExports?: Array<[string, string]>;
  /** Call the reactor's `_initialize` after instantiation (main instances only). Default true. */
  runInitialize?: boolean;
  /** Threads this instance may use (reported to `hostImports`). Default 1. */
  threads?: number;
}

export const DEFAULT_ENTRY = "ipc_ffi_entry";

/**
 * The generated `ipc_ffi_alloc`/`ipc_ffi_free` first; wasi-libc's `malloc`/`free` for modules that
 * export them; bb's historical `bbmalloc`/`bbfree` last.
 */
export const DEFAULT_ALLOCATOR_EXPORTS: Array<[string, string]> = [
  ["ipc_ffi_alloc", "ipc_ffi_free"],
  ["malloc", "free"],
  ["bbmalloc", "bbfree"],
];

type WasmFn = (...args: number[]) => number;

/**
 * One instance of an FFI-contract module: imports resolved (WASI shim, wasi-threads, module
 * specific host imports), `_initialize` run, and the `ipc_ffi_entry` call protocol implemented
 * over the module's own allocator.
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
    const entryName = opts.entry ?? DEFAULT_ENTRY;
    const entry = exports[entryName];
    if (typeof entry !== "function") {
      throw new Error(`wasm module does not export ${entryName}`);
    }
    const pair = (opts.allocatorExports ?? DEFAULT_ALLOCATOR_EXPORTS).find(
      ([a, f]) =>
        typeof exports[a] === "function" && typeof exports[f] === "function",
    );
    if (!pair) {
      throw new Error(
        `wasm module exports no allocator pair (looked for ${(
          opts.allocatorExports ?? DEFAULT_ALLOCATOR_EXPORTS
        )
          .map(([a, f]) => `${a}/${f}`)
          .join(", ")})`,
      );
    }
    return new WasmInstanceHost(
      instance,
      memory,
      entry as WasmFn,
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

  /**
   * One FFI round trip: request bytes in, a copy of the response bytes out. The request is
   * placed in module memory with the module's allocator, the response is read from where the
   * module left it and freed with the module's free, as the FFI contract requires.
   */
  call(input: Uint8Array): Uint8Array {
    const inPtr = input.length > 0 ? this.alloc(input.length) >>> 0 : 0;
    if (input.length > 0 && inPtr === 0) {
      throw new Error("wasm module allocation failed for the request buffer");
    }
    const slots = this.alloc(8) >>> 0;
    if (slots === 0) {
      throw new Error("wasm module allocation failed for the response slots");
    }
    let outPtr = 0;
    try {
      if (input.length > 0) {
        new Uint8Array(this.memory.buffer).set(input, inPtr);
      }
      const before = new DataView(this.memory.buffer);
      before.setUint32(slots, 0, true);
      before.setUint32(slots + 4, 0, true);
      this.entry(inPtr, input.length, slots, slots + 4);
      // Re-read through a fresh view: the call may have grown memory and detached the old buffer.
      const after = new DataView(this.memory.buffer);
      outPtr = after.getUint32(slots, true);
      const outLen = after.getUint32(slots + 4, true);
      return new Uint8Array(this.memory.buffer).slice(outPtr, outPtr + outLen);
    } finally {
      if (outPtr !== 0) {
        this.free(outPtr);
      }
      this.free(slots);
      if (inPtr !== 0) {
        this.free(inPtr);
      }
    }
  }
}
