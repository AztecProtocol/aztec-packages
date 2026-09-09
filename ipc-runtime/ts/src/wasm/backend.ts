import type { IpcClientAsync, IpcClientSync } from "../types.js";
import { type HostImportsFactory, WasmInstanceHost } from "./host.js";
import { type WasmModuleSource, compileWasmModule } from "./module_source.js";
import type { WasmPlatform, WorkerHandle } from "./platform.js";

/** Options shared by every way of running an FFI-contract module. */
export interface WasmFfiOptions {
  /** The module: a compiled `Module`, bytes (gzipped or not), a `Response`, or a URL/string. */
  module: WasmModuleSource;
  /** Threads to run with (1 = no worker threads). Default: the platform's parallelism, capped at 32. */
  threads?: number;
  /** Linear memory bounds in 64 KiB pages; `shared` defaults to `threads > 1`. */
  memory?: { initial?: number; maximum?: number; shared?: boolean };
  /** WASI environ for the module. `HARDWARE_CONCURRENCY` and `RAYON_NUM_THREADS` default to `threads`. */
  env?: Record<string, string>;
  logger?: (msg: string) => void;
  /** Module-specific imports beyond WASI/wasi-threads (see `HostImportsFactory`). */
  hostImports?: HostImportsFactory;
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
  /** Override the worker factories (packages whose modules need `hostImports` ship their own). */
  createThreadWorker?: () => WorkerHandle;
  createMainWorker?: () => WorkerHandle;
}

const MAX_THREADS = 32;
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
 * One worker per wasi thread, created when the module spawns it and dropped when it exits.
 *
 * A worker runs a thread to completion inside `wasi_thread_start`, so it can serve exactly one
 * thread at a time; giving each its own worker is both the simplest arrangement and the only
 * correct one. The module decides how many threads it wants — typically a pool of its own, sized
 * from the thread count it was told — and this follows.
 */
class Threads {
  private readonly workers = new Map<number, WorkerHandle>();
  private nextTid = FIRST_THREAD_ID;
  private unrefed = false;

  constructor(
    private readonly createWorker: () => WorkerHandle,
    private readonly init: Record<string, unknown>,
    private readonly logger: (msg: string) => void,
  ) {}

  /**
   * wasi-threads `thread-spawn`: start the module's thread entry on a new worker and return its
   * tid. The import is synchronous, so the worker boots while the caller carries on; its `init`
   * and `start` messages are queued in order and the worker serializes them.
   */
  spawn(startArg: number): number {
    const tid = this.nextTid++;
    let worker: WorkerHandle;
    try {
      worker = this.createWorker();
    } catch (e) {
      this.logger(`wasm thread ${tid} could not be created: ${String(e)}`);
      return -1;
    }
    this.workers.set(tid, worker);
    worker.onMessage((msg) => {
      if (msg?.type === "log") {
        this.logger(msg.message);
      } else if (msg?.type === "thread-exit" || msg?.type === "init-error") {
        if (msg.type === "init-error") {
          this.logger(`wasm thread ${tid} failed to start: ${msg.message}`);
        }
        this.workers.delete(tid);
        void worker.terminate();
      }
    });
    worker.onError((err) => {
      this.logger(`wasm thread ${tid}: ${String(err)}`);
      this.workers.delete(tid);
    });
    worker.postMessage({ type: "init", ...this.init });
    worker.postMessage({ type: "start", tid, startArg });
    if (this.unrefed) {
      worker.unref();
    }
    return tid;
  }

  unref(): void {
    this.unrefed = true;
    for (const w of this.workers.values()) {
      w.unref();
    }
  }

  async destroy(): Promise<void> {
    const workers = [...this.workers.values()];
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
    const wantShared =
      opts.memory?.shared ??
      (wantThreads > 1 && platform.sharedMemoryAvailable());
    const memory = createMemory(
      module,
      opts.memory?.initial ?? DEFAULT_INITIAL_PAGES,
      opts.memory?.maximum ??
        platform.maximumMemoryPages?.() ??
        DEFAULT_MAXIMUM_PAGES,
      wantShared,
    );
    // The module's declaration wins over the request: a threads build gets a shared memory even
    // for one thread, and workers need a shared memory, so the thread count follows the memory.
    // A module that defines its own memory instead of importing one cannot be threaded at all —
    // every instance would get a memory of its own, with nothing shared between them.
    const importsMemory = WebAssembly.Module.imports(module).some(
      (i) => i.kind === "memory",
    );
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
    // Threads are created when the module asks for them, so nothing is spawned here — and
    // nothing at all if the module never spawns a thread.
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
      hostImports: opts.hostImports,
      entry: opts.entry,
      threads,
      spawnThread: (startArg) => threadWorkers?.spawn(startArg) ?? -1,
    });
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
 * The module's declared maximum is not visible from JS: instantiating with a larger `maximum`
 * fails with a LinkError naming it, so probe downward until the import links.
 */
function createMemory(
  module: WebAssembly.Module,
  initial: number,
  maximum: number,
  shared: boolean,
): WebAssembly.Memory {
  const imported = WebAssembly.Module.imports(module).find(
    (i) => i.kind === "memory",
  );
  let max = Math.max(initial, maximum);
  let flippedShared = false;
  for (;;) {
    let memory: WebAssembly.Memory;
    try {
      memory = new WebAssembly.Memory({ initial, maximum: max, shared });
    } catch (e) {
      // The engine could not reserve that much address space (e.g. mobile browsers).
      if (max > initial) {
        max = Math.max(initial, Math.floor(max / 2));
        continue;
      }
      throw e;
    }
    if (!imported) {
      return memory;
    }
    try {
      // A dry instantiation only to validate the memory import. V8 checks that every import
      // module exists before it validates any single import, so stub every function import;
      // the only errors left are then about the memory itself.
      const stubs: Record<string, Record<string, WebAssembly.ImportValue>> = {};
      for (const imp of WebAssembly.Module.imports(module)) {
        stubs[imp.module] ??= {};
        if (imp.kind === "memory") {
          stubs[imp.module][imp.name] = memory;
        } else if (imp.kind === "function") {
          stubs[imp.module][imp.name] = () => 0;
        }
      }
      new WebAssembly.Instance(module, stubs);
      return memory;
    } catch (e) {
      const message = e instanceof WebAssembly.LinkError ? String(e) : "";
      if (message.includes("maximum") && max > initial) {
        max = Math.max(initial, Math.floor(max / 2));
        continue;
      }
      // A threads build declares its memory shared even when it will run with one thread (and a
      // single-thread build declares it unshared): follow the module's declaration.
      if (message.includes("shared") && !flippedShared) {
        flippedShared = true;
        shared = !shared;
        continue;
      }
      return memory;
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
    // shared with the worker; `hostImports` are functions and cannot cross the boundary, so a
    // module needing them ships a worker entry that supplies them (see `runMainWorker`).
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
        memory: opts.memory,
        env: opts.env,
        entry: opts.entry,
      },
    });
    await ready;
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
