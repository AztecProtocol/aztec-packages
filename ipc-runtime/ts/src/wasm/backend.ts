import type { IpcClientAsync, IpcClientSync } from "../types.js";
import { WasmInstanceHost } from "./host.js";
import { type WasmModuleSource, compileWasmModule } from "./module_source.js";
import type { WasmPlatform, WorkerHandle } from "./platform.js";

/** A module's memory import as declared, in 64 KiB pages. */
export interface WasmMemoryImport {
  initial: number;
  /** Absent when the module declares no maximum. */
  maximum?: number;
  shared: boolean;
}

/** Options shared by every way of running an FFI-contract module. */
export interface WasmFfiOptions {
  /** The module: a compiled `Module`, bytes (gzipped or not), a `Response`, or a URL/string. */
  module: WasmModuleSource;
  /** Threads to run with (1 = no worker threads). Default: the platform's parallelism, capped at 32. */
  threads?: number;
  /**
   * Linear memory bounds in 64 KiB pages. For a module that imports its memory, `moduleMemory`
   * decides `shared` and bounds these; `shared` applies only to a module owning its memory.
   */
  memory?: { initial?: number; maximum?: number; shared?: boolean };
  /**
   * The module's memory import as the module declares it. Required when the module imports its
   * memory: JS can't read an import's limits, and the memory given must satisfy them. Generated
   * packages read it from their modules when the package is built.
   */
  moduleMemory?: WasmMemoryImport;
  /** WASI environ for the module. `HARDWARE_CONCURRENCY` and `RAYON_NUM_THREADS` default to `threads`. */
  env?: Record<string, string>;
  logger?: (msg: string) => void;
  /** FFI entry export; default: the module's one `<service>_ipc_ffi_entry` export. */
  entry?: string;
}

/**
 * What a platform entry (`index.node.ts` / `index.browser.ts`) binds for the backend. Workers are
 * created through factories rather than URLs: bundlers only bundle a worker's dependency graph when
 * they see the literal `new Worker(new URL('./x.js', import.meta.url), { type: 'module' })`, so
 * that expression has to live in the code that owns the worker script.
 */
export interface WasmFfiBinding {
  platform: WasmPlatform;
  /** Spawn a worker hosting one module instance per wasi thread. */
  createThreadWorker: () => WorkerHandle;
  /** Spawn the worker hosting the main instance when `worker: true`. */
  createMainWorker: () => WorkerHandle;
}

export interface WasmFfiBackendOptions extends WasmFfiOptions {
  /**
   * Run the main instance in a dedicated worker (default true), so a long call never blocks the
   * caller's event loop and, in browsers, the thread pool is spawned from a worker. With `false`
   * the main instance runs on the calling thread and every call blocks it until it returns.
   */
  worker?: boolean;
  /** Override the worker factories the platform entry binds. */
  createThreadWorker?: () => WorkerHandle;
  createMainWorker?: () => WorkerHandle;
}

/** Above this, more wasi threads stop paying for themselves; the engine clamps to it. */
export const MAX_THREADS = 32;
const DEFAULT_INITIAL_PAGES = 64;
const DEFAULT_MAXIMUM_PAGES = 65536;
const FIRST_THREAD_ID = 2;

type Pending = {
  resolve: (out: Uint8Array) => void;
  reject: (err: Error) => void;
};

function awaitReady(worker: WorkerHandle, what: string): Promise<void> {
  return new Promise((resolve, reject) => {
    worker.onMessage((msg) => {
      if (msg?.type === "ready") {
        resolve();
      } else if (msg?.type === "init-error") {
        reject(new Error(`${what}: ${msg.message}`));
      }
    });
    worker.onError((err) =>
      reject(err instanceof Error ? err : new Error(`${what}: ${String(err)}`)),
    );
  });
}

/**
 * One worker per wasi thread, dropped when its thread exits.
 *
 * A worker runs a thread to completion inside `wasi_thread_start`, so it can serve exactly one
 * thread at a time; giving each its own worker is both the simplest arrangement and the only
 * correct one. The module decides how many threads it wants — typically a pool of its own, sized
 * from the thread count it was told — and this follows.
 *
 * Workers are started ahead of the module's requests (`prestart`) because a browser sets up a
 * worker created by another worker on that parent's event loop, which is blocked for as long as the
 * module runs: a thread spawned during a call would only start once the call returned. A worker
 * already running needs only its `start` message, which a blocked parent still delivers.
 */
class Threads {
  private readonly workers = new Map<number, WorkerHandle>();
  /** Started workers with the module instantiated, waiting for a thread to run. */
  private readonly idle: WorkerHandle[] = [];
  private nextTid = FIRST_THREAD_ID;
  private unrefed = false;
  private destroyed = false;

  constructor(
    private readonly createWorker: () => WorkerHandle,
    private readonly init: Record<string, unknown>,
    private readonly logger: (msg: string) => void,
  ) {}

  /**
   * Start `count` workers and wait until each has instantiated the module, so that as many threads
   * spawned later start at once. A worker that fails to start is dropped, leaving its thread to be
   * started on demand. Call it only after the main instance is instantiated: every instance runs
   * the module's start function, and the first to do so on a shared memory claims its one-time
   * initialization, the main thread's TLS included. Exited threads are not replaced: a module that
   * spawns more threads than were prestarted (or restarts its pool) gets the extras on demand.
   */
  async prestart(count: number): Promise<void> {
    await Promise.all(Array.from({ length: count }, () => this.startIdle()));
  }

  /** Start one worker into `idle`; one that fails is logged and dropped. */
  private async startIdle(): Promise<void> {
    let worker: WorkerHandle | undefined;
    try {
      worker = this.boot();
      await awaitReady(worker, "wasm thread worker");
    } catch (e) {
      this.logger(`wasm thread worker could not be prestarted: ${String(e)}`);
      void worker?.terminate();
      return;
    }
    if (this.destroyed) {
      void worker.terminate();
    } else {
      this.idle.push(worker);
    }
  }

  /** A new worker, told to instantiate the module. */
  private boot(): WorkerHandle {
    const worker = this.createWorker();
    worker.onMessage((msg) => {
      if (msg?.type === "log") {
        this.logger(msg.message);
      }
    });
    worker.postMessage({ type: "init", ...this.init });
    if (this.unrefed) {
      worker.unref();
    }
    return worker;
  }

  /**
   * wasi-threads `thread-spawn`: run the module's thread entry on a prestarted worker, or on a new
   * one when none is left, and return its tid. The import is synchronous: a new worker boots while
   * the caller carries on, and serializes its queued `init` and `start`.
   */
  spawn(startArg: number): number {
    const tid = this.nextTid++;
    let worker = this.idle.pop();
    if (!worker) {
      try {
        worker = this.boot();
      } catch (e) {
        this.logger(`wasm thread ${tid} could not be created: ${String(e)}`);
        return -1;
      }
    }
    const running = worker;
    this.workers.set(tid, running);
    running.onMessage((msg) => {
      if (msg?.type === "thread-exit" || msg?.type === "init-error") {
        if (msg.type === "init-error") {
          this.logger(`wasm thread ${tid} failed to start: ${msg.message}`);
        }
        this.workers.delete(tid);
        void running.terminate();
      }
    });
    running.onError((err) => {
      this.logger(`wasm thread ${tid}: ${String(err)}`);
      this.workers.delete(tid);
    });
    running.postMessage({ type: "start", tid, startArg });
    return tid;
  }

  unref(): void {
    this.unrefed = true;
    for (const w of [...this.workers.values(), ...this.idle]) {
      w.unref();
    }
  }

  async destroy(): Promise<void> {
    this.destroyed = true;
    const workers = [...this.workers.values(), ...this.idle.splice(0)];
    this.workers.clear();
    await Promise.all(workers.map((w) => w.terminate()));
  }
}

/**
 * The module running on the current thread: memory, main instance, and the workers serving its
 * `thread-spawn` requests. `call` is synchronous and blocks until the module returns.
 */
export class WasmFfiEngine {
  private constructor(
    /** The module instance, for reaching exports of its own beyond the FFI entry. */
    readonly host: WasmInstanceHost,
    private readonly threadWorkers: Threads | undefined,
    readonly memory: WebAssembly.Memory,
    readonly threads: number,
  ) {}

  static async create(
    opts: WasmFfiOptions,
    binding: WasmFfiBinding,
  ): Promise<WasmFfiEngine> {
    const { platform } = binding;
    const logger = opts.logger ?? (() => {});
    const module = await compileWasmModule(opts.module, platform);
    const wantThreads = Math.max(
      1,
      Math.min(opts.threads ?? platform.hardwareConcurrency(), MAX_THREADS),
    );
    // A module that defines its own memory instead of importing one cannot be threaded at all —
    // every instance would get a memory of its own, with nothing shared between them.
    const importsMemory = WebAssembly.Module.imports(module).some(
      (i) => i.kind === "memory",
    );
    if (importsMemory && !opts.moduleMemory) {
      throw new Error(
        "the module imports its memory: pass moduleMemory, its memory import as declared",
      );
    }
    const initial = opts.memory?.initial ?? DEFAULT_INITIAL_PAGES;
    const maximum =
      opts.memory?.maximum ??
      platform.maximumMemoryPages?.() ??
      DEFAULT_MAXIMUM_PAGES;
    // The module's declaration wins over the request: a threads build gets a shared memory even
    // for one thread, and workers need a shared memory, so the thread count follows the memory.
    const memory = opts.moduleMemory
      ? createMemory(opts.moduleMemory, initial, maximum)
      : new WebAssembly.Memory({
          initial,
          maximum,
          shared:
            opts.memory?.shared ??
            (wantThreads > 1 && platform.sharedMemoryAvailable()),
        });
    const shared = memory.buffer instanceof SharedArrayBuffer;
    const threads =
      importsMemory && shared && platform.sharedMemoryAvailable()
        ? wantThreads
        : 1;
    const env = {
      HARDWARE_CONCURRENCY: String(threads),
      RAYON_NUM_THREADS: String(threads),
      ...(opts.env ?? {}),
    };
    const threadWorkers =
      threads > 1
        ? new Threads(
            binding.createThreadWorker,
            {
              module,
              memory,
              env,
              entry: opts.entry,
            },
            logger,
          )
        : undefined;

    const host = await WasmInstanceHost.instantiate({
      module,
      memory,
      env,
      logger,
      entry: opts.entry,
      threads,
      spawnThread: (startArg) => threadWorkers?.spawn(startArg) ?? -1,
    }).catch((e) => {
      if (e instanceof WebAssembly.LinkError && opts.moduleMemory) {
        throw new Error(
          `${e.message}: the memory was made for a declared import of ${JSON.stringify(opts.moduleMemory)}, ` +
            "and a module run in place of a package's own must declare the same memory",
        );
      }
      throw e;
    });
    // As many as the thread count the module is told: bb spawns HARDWARE_CONCURRENCY - 1 and keeps
    // the main thread working, but rayon spawns RAYON_NUM_THREADS workers besides the caller, and
    // its build_global waits until all of them run, which in a browser would wait forever on one
    // started only after the call. A module spawning more gets the extras on demand.
    await threadWorkers?.prestart(threads);
    // host.memory is the one the module actually uses, which is its own when it exports one.
    logger(
      `wasm: ${threads} thread(s), memory ${host.memory.buffer.byteLength >> 16} pages initial, ` +
        `shared=${host.memory.buffer instanceof SharedArrayBuffer}, ` +
        `${importsMemory ? "imported" : "owned by the module"}`,
    );
    return new WasmFfiEngine(host, threadWorkers, host.memory, threads);
  }

  call(input: Uint8Array): Uint8Array {
    return this.host.call(input);
  }

  unref(): void {
    this.threadWorkers?.unref();
  }

  async destroy(): Promise<void> {
    await this.threadWorkers?.destroy();
  }
}

/**
 * A memory for the module's declared import: shared as declared, at least its initial size, and no
 * larger than its maximum, so the import links. The requested maximum halves while the engine can't
 * reserve that much address space (e.g. mobile browsers).
 */
function createMemory(
  declared: WasmMemoryImport,
  initial: number,
  maximum: number,
): WebAssembly.Memory {
  const min = Math.max(initial, declared.initial);
  let max = Math.max(
    min,
    declared.maximum === undefined
      ? maximum
      : Math.min(maximum, declared.maximum),
  );
  for (;;) {
    try {
      return new WebAssembly.Memory({
        initial: min,
        maximum: max,
        shared: declared.shared,
      });
    } catch (e) {
      if (max > min) {
        max = Math.max(min, Math.floor(max / 2));
        continue;
      }
      throw e;
    }
  }
}

/**
 * Asynchronous FFI backend over a wasm module. Implements the runtime's `IpcClientAsync`, so the
 * generated `AsyncApi` sits on it exactly as it sits on a spawned process.
 */
export class WasmFfiBackend implements IpcClientAsync {
  private seq = 0;
  private readonly pending = new Map<number, Pending>();

  private constructor(
    private readonly engine: WasmFfiEngine | undefined,
    private readonly worker: WorkerHandle | undefined,
  ) {}

  static async create(
    opts: WasmFfiBackendOptions,
    binding: WasmFfiBinding,
  ): Promise<WasmFfiBackend> {
    const bound: WasmFfiBinding = {
      platform: binding.platform,
      createThreadWorker: opts.createThreadWorker ?? binding.createThreadWorker,
      createMainWorker: opts.createMainWorker ?? binding.createMainWorker,
    };
    if (opts.worker === false) {
      return new WasmFfiBackend(
        await WasmFfiEngine.create(opts, bound),
        undefined,
      );
    }
    // Compile here so the (cached, streaming) compilation happens once and the compiled Module is
    // what crosses to the worker, rather than each side compiling the same bytes.
    const module = await compileWasmModule(opts.module, bound.platform);
    const worker = bound.createMainWorker();
    const backend = new WasmFfiBackend(undefined, worker);
    const ready = awaitReady(worker, "wasm main worker");
    worker.onMessage((msg) => backend.onWorkerMessage(msg, opts.logger));
    worker.postMessage({
      type: "init",
      module,
      options: {
        threads: opts.threads,
        memory: {
          ...opts.memory,
          // The worker cannot tell an iPad from a Mac: its navigator has no maxTouchPoints.
          maximum:
            opts.memory?.maximum ?? bound.platform.maximumMemoryPages?.(),
        },
        moduleMemory: opts.moduleMemory,
        env: opts.env,
        entry: opts.entry,
      },
    });
    try {
      await ready;
    } catch (e) {
      await worker.terminate();
      throw e;
    }
    return backend;
  }

  private onWorkerMessage(msg: any, logger?: (msg: string) => void): void {
    if (msg?.type === "log") {
      logger?.(msg.message);
      return;
    }
    if (msg?.type !== "result" && msg?.type !== "error") {
      return;
    }
    const pending = this.pending.get(msg.id);
    if (!pending) {
      return;
    }
    this.pending.delete(msg.id);
    if (msg.type === "result") {
      pending.resolve(new Uint8Array(msg.output));
    } else {
      pending.reject(new Error(msg.message));
    }
  }

  call(input: Uint8Array): Promise<Uint8Array> {
    if (this.engine) {
      try {
        return Promise.resolve(this.engine.call(input));
      } catch (e) {
        return Promise.reject(e);
      }
    }
    const id = ++this.seq;
    // A private copy so the request can be transferred rather than cloned. Not `slice()`: on a
    // node Buffer that aliases the caller's (pooled) memory, which the transfer would detach.
    const copy = new Uint8Array(input.byteLength);
    copy.set(input);
    return new Promise<Uint8Array>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker!.postMessage({ type: "call", id, input: copy }, [
        copy.buffer,
      ]);
    });
  }

  /** Let the host process exit even while the module's workers are alive (node). */
  unref(): void {
    this.engine?.unref();
    this.worker?.unref();
  }

  async destroy(): Promise<void> {
    if (this.engine) {
      await this.engine.destroy();
      return;
    }
    const worker = this.worker!;
    const done = new Promise<void>((resolve) => {
      worker.onMessage((msg) => {
        if (msg?.type === "destroyed") {
          resolve();
        }
      });
    });
    worker.postMessage({ type: "destroy" });
    await Promise.race([done, new Promise((r) => setTimeout(r, 2000))]);
    await worker.terminate();
    for (const p of this.pending.values()) {
      p.reject(new Error("wasm backend destroyed"));
    }
    this.pending.clear();
  }
}

/**
 * Synchronous FFI backend: the module runs on the calling thread and every call blocks until it
 * returns. Defaults to one thread, since a blocked caller cannot service anything else.
 */
export class WasmFfiBackendSync implements IpcClientSync {
  private constructor(private readonly engine: WasmFfiEngine) {}

  static async create(
    opts: WasmFfiOptions,
    binding: WasmFfiBinding,
  ): Promise<WasmFfiBackendSync> {
    return new WasmFfiBackendSync(
      await WasmFfiEngine.create({ threads: 1, ...opts }, binding),
    );
  }

  call(input: Uint8Array): Uint8Array {
    return this.engine.call(input);
  }

  unref(): void {
    this.engine.unref();
  }

  destroy(): void {
    void this.engine.destroy();
  }
}
