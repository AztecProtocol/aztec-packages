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
   * bound to `target`. A throw or rejection fails the call in the module with its message. Unset,
   * every host call fails, which leaves a module that never makes one unaffected.
   */
  hostCall?: HostCallAnswer;
  /**
   * Let host calls be answered asynchronously, through JSPI: the module's stack is suspended while
   * an answer is awaited, and calls are made with `callAsync`. JSPI suspends on every host call,
   * answered synchronously or not, so an instance either suspends or doesn't: without this, `call`
   * runs synchronously and an asynchronous answer fails the host call.
   */
  suspending?: boolean;
}

/** What a module's host call is answered with. */
export type HostCallAnswer = (
  target: string,
  request: Uint8Array,
) => Uint8Array | Promise<Uint8Array>;

/** JSPI (`WebAssembly.Suspending` and `WebAssembly.promising`), which the lib typings predate. */
interface Jspi {
  Suspending: new (fn: (...args: number[]) => unknown) => WebAssembly.ImportValue;
  promising: (fn: WasmFn) => (...args: number[]) => Promise<unknown>;
}

/** The engine's JSPI, or undefined where it has none. */
export function jspi(): Jspi | undefined {
  const wasm = WebAssembly as unknown as Partial<Jspi>;
  return typeof wasm.Suspending === "function" &&
    typeof wasm.promising === "function"
    ? (wasm as Jspi)
    : undefined;
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { then?: unknown }).then === "function"
  );
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
    /** The entry as JSPI's `promising` wraps it, when the instance suspends. */
    private readonly suspendingEntry:
      | ((...args: number[]) => Promise<unknown>)
      | undefined,
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
    const suspend = opts.suspending ? jspi() : undefined;
    if (opts.suspending && !suspend) {
      throw new Error(
        "this engine has no JSPI (WebAssembly.Suspending), which asynchronous host calls need",
      );
    }
    // The import is bound before the instance exists; the calls it makes need the instance.
    let self: WasmInstanceHost | undefined;
    const hostCall = (
      targetPtr: number,
      targetLen: number,
      requestPtr: number,
      requestLen: number,
      responsePtrOut: number,
      responseLenOut: number,
    ) =>
      self!.hostCall(
        opts.hostCall,
        suspend !== undefined,
        targetPtr >>> 0,
        targetLen >>> 0,
        requestPtr >>> 0,
        requestLen >>> 0,
        responsePtrOut >>> 0,
        responseLenOut >>> 0,
      );
    const imports: Record<string, Record<string, WebAssembly.ImportValue>> = {
      [HOST_CALL_NAMESPACE]: {
        host_call: suspend ? new suspend.Suspending(hostCall) : hostCall,
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
      suspend?.promising(exports[entry] as WasmFn),
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
   * is none; a promise of that when the instance suspends.
   */
  private hostCall(
    handler: InstanceOptions["hostCall"],
    suspending: boolean,
    targetPtr: number,
    targetLen: number,
    requestPtr: number,
    requestLen: number,
    responsePtrOut: number,
    responseLenOut: number,
  ): number | Promise<number> {
    this.refreshViews();
    const target = new TextDecoder().decode(
      this.bytes.subarray(targetPtr, targetPtr + targetLen),
    );
    // A copy: the handler may call back into module memory, growing and detaching this view.
    const request = this.bytes.slice(requestPtr, requestPtr + requestLen);
    const fail = (e: unknown) =>
      this.answer(
        1,
        new TextEncoder().encode(e instanceof Error ? e.message : String(e)),
        responsePtrOut,
        responseLenOut,
      );
    let response: Uint8Array | Promise<Uint8Array>;
    try {
      if (!handler) {
        throw new Error(
          "nothing is bound for this module's host calls (pass hostCall)",
        );
      }
      response = handler(target, request);
    } catch (e) {
      return fail(e);
    }
    if (isThenable(response)) {
      if (!suspending) {
        // Nothing can settle it: the module holds this thread until it returns.
        void Promise.resolve(response).catch(() => {});
        return fail(
          new Error(
            `host call "${target}" answered asynchronously; a synchronous backend needs synchronous answers`,
          ),
        );
      }
      return Promise.resolve(response).then(
        (bytes) => this.answer(0, bytes, responsePtrOut, responseLenOut),
        fail,
      );
    }
    return this.answer(0, response, responsePtrOut, responseLenOut);
  }

  /** Leave a host call's answer in a buffer from the module's allocator, and return its status. */
  private answer(
    status: number,
    response: Uint8Array,
    responsePtrOut: number,
    responseLenOut: number,
  ): number {
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
   * no allocator traffic of its own. It only ever grows, and calls never overlap (see `inCall`), so
   * one buffer is enough.
   */
  private scratch = 0;
  private scratchCapacity = 0;
  /**
   * Whether a call is in progress. A suspended call leaves the thread free, and a second call
   * entering the module then would run its handler mid-call and overwrite the scratch, so callers
   * queue their calls (see `WasmFfiBackend`); this only catches one that doesn't.
   */
  private inCall = false;

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

  /** Whether this instance suspends on host calls, and so is called through `callAsync`. */
  get suspends(): boolean {
    return this.suspendingEntry !== undefined;
  }

  /**
   * One FFI round trip: request bytes in, a copy of the response bytes out. The request is placed
   * in module memory, and the response is read from where the module left it and released with the
   * module's own free, as the FFI contract requires.
   */
  call(input: Uint8Array): Uint8Array {
    if (this.suspendingEntry) {
      throw new Error(
        "this wasm instance suspends on host calls; call it with callAsync",
      );
    }
    const slots = this.begin(input);
    try {
      this.entry(slots + SLOTS_BYTES, input.length, slots, slots + 4);
    } catch (cause) {
      this.inCall = false;
      throw this.explain(cause);
    }
    return this.finish(slots);
  }

  /** `call`, for an instance that suspends on host calls: it settles once the module returns. */
  async callAsync(input: Uint8Array): Promise<Uint8Array> {
    if (!this.suspendingEntry) {
      return this.call(input);
    }
    const slots = this.begin(input);
    try {
      await this.suspendingEntry(
        slots + SLOTS_BYTES,
        input.length,
        slots,
        slots + 4,
      );
    } catch (cause) {
      this.inCall = false;
      throw this.explain(cause);
    }
    return this.finish(slots);
  }

  /** Place the request in module memory and clear the response slots; returns the slots. */
  private begin(input: Uint8Array): number {
    if (this.inCall) {
      throw new Error("wasm module called while a call into it is in progress");
    }
    const slots = this.reserveScratch(SLOTS_BYTES + input.length);
    this.inCall = true;
    this.stderr.reset();
    this.refreshViews();
    this.bytes.set(input, slots + SLOTS_BYTES);
    this.words.setUint32(slots, 0, true);
    this.words.setUint32(slots + 4, 0, true);
    return slots;
  }

  /** Copy out the response the module left in the slots and release it. */
  private finish(slots: number): Uint8Array {
    this.inCall = false;
    // The call may have grown memory, detaching the buffer the views were built over.
    this.refreshViews();
    const outPtr = this.words.getUint32(slots, true);
    const outLen = this.words.getUint32(slots + 4, true);
    try {
      return this.bytes.slice(outPtr, outPtr + outLen);
    } finally {
      if (outPtr !== 0) {
        this.free(outPtr);
      }
    }
  }

  /** A trap with what the module wrote to stderr before it, which says what went wrong. */
  private explain(cause: unknown): unknown {
    const reported = this.stderr.text();
    return reported ? new Error(reported, { cause }) : cause;
  }
}
