import { WASI_NAMESPACE, createWasiImports } from "./wasi_shim.js";

export interface InstanceOptions {
  module: WebAssembly.Module;
  memory: WebAssembly.Memory;
  /** WASI environ for the module (e.g. `HARDWARE_CONCURRENCY`). */
  env?: Record<string, string>;
  logger?: (msg: string) => void;
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
  /** Call the reactor's `_initialize` after instantiation (main instances only). Default true. */
  runInitialize?: boolean;
  /** Threads this instance may use, for the WASI environ the module reads. Default 1. */
  threads?: number;
  /**
   * Answers the module's `ipc_runtime.host_call(target, request)`: the response bytes of the service
   * bound to `target`, synchronously. A throw fails the call in the module with its message. Unset,
   * every host call fails, which leaves a module that never makes one unaffected.
   */
  hostCall?: (target: string, request: Uint8Array) => Uint8Array;
}

/** The import module a module reaches its host's services through (see `InstanceOptions.hostCall`). */
export const HOST_CALL_NAMESPACE = "ipc_runtime";

/** Every FFI entry export ends with this; the generated ones are prefixed by their service. */
export const ENTRY_SUFFIX = "ipc_ffi_entry";

/** Allocator pairs tried after the entry's own `<service>_ipc_ffi_alloc`/`_free`. */
export const FALLBACK_ALLOCATOR_EXPORTS: Array<[string, string]> = [["malloc", "free"]];

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
 * One instance of an FFI-contract module: imports resolved (WASI shim, wasi-threads),
 * `_initialize` run, and the `<service>_ipc_ffi_entry` call protocol
 * implemented over the module's own allocator.
 */
/**
 * The tail of what the module wrote to stderr during the current call. A module compiled without
 * exceptions cannot return a message when it gives up: it writes one out and exits. Keeping the
 * text is what turns the bare `proc_exit` or trap the caller would otherwise see into an error
 * that says what went wrong.
 */
class StderrTail {
  private static readonly MAX_LINES = 8;
  private lines: string[] = [];

  record(line: string): void {
    this.lines.push(line);
    if (this.lines.length > StderrTail.MAX_LINES) {
      this.lines.shift();
    }
  }

  reset(): void {
    this.lines.length = 0;
  }

  text(): string {
    return this.lines.join("\n").trim();
  }
}

export class WasmInstanceHost {
  private constructor(
    readonly instance: WebAssembly.Instance,
    readonly memory: WebAssembly.Memory,
    private readonly entry: WasmFn,
    private readonly alloc: WasmFn,
    private readonly free: WasmFn,
    readonly logger: (msg: string) => void,
    private readonly stderr: StderrTail,
  ) {}

  static async instantiate(opts: InstanceOptions): Promise<WasmInstanceHost> {
    // A module either imports its memory, and is handed the one the caller made, or defines and
    // exports its own — the default for a Rust cdylib. Which it is is only settled below, after
    // instantiation, so everything reading memory goes through this.
    let memory = opts.memory;
    const logger = opts.logger ?? (() => {});
    const stderr = new StderrTail();
    // The import is bound before the instance exists; the calls it makes need the instance.
    let self: WasmInstanceHost | undefined;
    const imports: Record<string, Record<string, WebAssembly.ImportValue>> = {
      [HOST_CALL_NAMESPACE]: {
        host_call: (
          targetPtr: number,
          targetLen: number,
          requestPtr: number,
          requestLen: number,
          responsePtrOut: number,
          responseLenOut: number,
        ) =>
          self!.hostCall(
            opts.hostCall,
            targetPtr >>> 0,
            targetLen >>> 0,
            requestPtr >>> 0,
            requestLen >>> 0,
            responsePtrOut >>> 0,
            responseLenOut >>> 0,
          ),
      },
      env: { memory },
      [WASI_NAMESPACE]: createWasiImports(opts.module, () => memory, {
        env: opts.env,
        onStderr: (line) => {
          stderr.record(line);
          logger(line);
        },
        onStdout: logger,
      }),
      wasi: {
        "thread-spawn": (startArg: number) =>
          opts.spawnThread ? opts.spawnThread(startArg >>> 0) : -1,
      },
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
        `wasm module imports what this host does not provide; it must be a WASI reactor: ${missing.join(", ")}`,
      );
    }

    const instance = await WebAssembly.instantiate(opts.module, imports);
    const exports = instance.exports as Record<string, WebAssembly.ExportValue>;
    if (exports.memory instanceof WebAssembly.Memory) {
      // The module defined its own; the one passed in (if any) is not what it reads and writes.
      memory = exports.memory;
    }
    if (
      opts.runInitialize !== false &&
      typeof exports._initialize === "function"
    ) {
      (exports._initialize as () => void)();
    }
    const { entry, prefix } = findEntry(exports, opts.entry);
    const allocatorExports: Array<[string, string]> = [
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
    self = new WasmInstanceHost(
      instance,
      memory,
      exports[entry] as WasmFn,
      exports[pair[0]] as WasmFn,
      exports[pair[1]] as WasmFn,
      logger,
      stderr,
    );
    return self;
  }

  /**
   * The `host_call` import: read the target and request out of module memory, answer through
   * `handler`, and leave the answer in a buffer from the module's allocator, which the module frees.
   * Returns 0 when the bytes are the service's response, 1 when they are a message saying why there
   * is none.
   */
  private hostCall(
    handler: InstanceOptions["hostCall"],
    targetPtr: number,
    targetLen: number,
    requestPtr: number,
    requestLen: number,
    responsePtrOut: number,
    responseLenOut: number,
  ): number {
    this.refreshViews();
    const target = new TextDecoder().decode(
      this.bytes.subarray(targetPtr, targetPtr + targetLen),
    );
    // A copy: the handler may call back into module memory, growing and detaching this view.
    const request = this.bytes.slice(requestPtr, requestPtr + requestLen);
    let status = 0;
    let response: Uint8Array;
    try {
      if (!handler) {
        throw new Error(
          "nothing is bound for this module's host calls (pass hostCall)",
        );
      }
      response = handler(target, request);
    } catch (e) {
      status = 1;
      response = new TextEncoder().encode(
        e instanceof Error ? e.message : String(e),
      );
    }
    const ptr = this.alloc(Math.max(1, response.length)) >>> 0;
    if (ptr === 0) {
      throw new Error(
        `wasm module could not allocate a ${response.length} byte host call response`,
      );
    }
    this.refreshViews();
    this.bytes.set(response, ptr);
    this.words.setUint32(responsePtrOut, ptr, true);
    this.words.setUint32(responseLenOut, response.length, true);
    return status;
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
    this.stderr.reset();
    try {
      this.refreshViews();
      this.bytes.set(input, inPtr);
      this.words.setUint32(slots, 0, true);
      this.words.setUint32(slots + 4, 0, true);
      try {
        this.entry(inPtr, input.length, slots, slots + 4);
      } catch (cause) {
        const reported = this.stderr.text();
        if (!reported) {
          throw cause;
        }
        throw new Error(reported, { cause });
      }
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
