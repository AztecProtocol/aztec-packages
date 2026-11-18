import type { IpcClientAsync, IpcClientSync } from "../types.js";
import {
  HOST_CALL_NAMESPACE,
  type HostCallAnswer,
  WasmInstanceHost,
} from "./host.js";
import { type HostCallTargets, hostCallOn, unwrapTarget } from "./host_call.js";
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
  /** The name the module's FFI exports carry (`<ffiName>_ipc_ffi_call`); default: the module's one such name. */
  ffiName?: string;
  /** The services the module's `ipc_runtime.host_call` reaches, by target name (see `HostCallTarget`). */
  hostCall?: HostCallTargets;
}

/** What the engine is given: the host calls already resolved to one function answering them. */
export interface WasmEngineOptions extends Omit<WasmFfiOptions, "hostCall"> {
  hostCall?: HostCallAnswer;
  /**
   * Answer host calls asynchronously (JSPI), and be called through `callAsync`. Taken only by a
   * module that makes host calls, since JSPI suspends on every one; any other runs synchronously.
   */
  suspending?: boolean;
}

/** Whether a module imports `ipc_runtime.host_call`, and so may need to wait on its host. */
export function importsHostCall(module: WebAssembly.Module): boolean {
  return WebAssembly.Module.imports(module).some(
    (i) => i.module === HOST_CALL_NAMESPACE && i.name === "host_call",
  );
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
  /** Spawn the worker hosting the main instance when no ServiceThread is given. */
  createMainWorker: () => WorkerHandle;
}

export interface WasmFfiBackendOptions extends WasmFfiOptions {
  /**
   * The ServiceThread the main instance runs on, shared with the other instances loaded there, which
   * can then be each other's host-call targets with no message passing between them. Default: a
   * worker of its own. Either way a call never blocks the caller; to run on the calling thread, use
   * the synchronous backend.
   */
  worker?: ServiceThread;
  /** Override the worker factories the platform entry binds. */
  createThreadWorker?: () => WorkerHandle;
  createMainWorker?: () => WorkerHandle;
}

/** What a worker slot runs: a wasm module's main instance, or an instance of a service's shared library (node). */
export type WorkerInstanceSource = {
  module: WebAssembly.Module;
  options: Omit<WasmFfiOptions, "module" | "hostCall" | "logger">;
};

/** Something that lives and ends with a ServiceThread (see `attachment`). */
interface Attachment {
  destroy(): Promise<void>;
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
    /** The module instance, for reaching exports of its own beyond the FFI. */
    readonly host: WasmInstanceHost,
    private readonly threadWorkers: Threads | undefined,
    readonly memory: WebAssembly.Memory,
    readonly threads: number,
  ) {}

  static async create(
    opts: WasmEngineOptions,
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
    const shared = isShared(memory.buffer);
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
              ffiName: opts.ffiName,
            },
            logger,
          )
        : undefined;

    const host = await WasmInstanceHost.instantiate({
      module,
      memory,
      env,
      logger,
      ffiName: opts.ffiName,
      threads,
      spawnThread: (startArg) => threadWorkers?.spawn(startArg) ?? -1,
      hostCall: opts.hostCall,
      suspending: opts.suspending && importsHostCall(module),
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
        `shared=${isShared(host.memory.buffer)}, ` +
        `${importsMemory ? "imported" : "owned by the module"}`,
    );
    return new WasmFfiEngine(host, threadWorkers, host.memory, threads);
  }

  /** Whether calls must go through `callAsync`, the module suspending on its host calls. */
  get suspends(): boolean {
    return this.host.suspends;
  }

  call(input: Uint8Array): Uint8Array {
    return this.host.call(input);
  }

  callAsync(input: Uint8Array): Promise<Uint8Array> {
    return this.host.callAsync(input);
  }

  /** Any call, by whichever way this engine is called. */
  callEither(input: Uint8Array): Uint8Array | Promise<Uint8Array> {
    return this.host.suspends
      ? this.host.callAsync(input)
      : this.host.call(input);
  }

  unref(): void {
    this.threadWorkers?.unref();
  }

  async destroy(): Promise<void> {
    await this.threadWorkers?.destroy();
  }
}

/**
 * Reads the buffer's tag: the SharedArrayBuffer global is absent where a page is not
 * cross-origin isolated.
 */
function isShared(buffer: ArrayBufferLike): boolean {
  return (
    Object.prototype.toString.call(buffer) === "[object SharedArrayBuffer]"
  );
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
 * A thread hosting service instances, each in a slot of its own: wasm modules' main instances on a
 * worker, and instances of services' shared libraries (napi, node) on a native thread beside it.
 * The instances on one thread run one call at a time between them, and an instance can reach
 * another on the same thread as a host-call target directly. Handlers of the owner's own answer a
 * wasm module by message, the module suspended (JSPI) until the answer arrives, and a napi instance
 * from the owner's event loop while its native thread blocks.
 *
 * An instance is loaded with `WasmFfiBackend.create({ worker })` or
 * `createNapiFfiBackend({ worker })`. Each kind of thread starts with the first instance that
 * needs it, and lives until `destroy()`, which ends every instance on it.
 */
export class ServiceThread {
  private nextSlot = 0;
  private seq = 0;
  private readonly pending = new Map<number, Pending>();
  private readonly loading = new Map<number, Pending>();
  private readonly loggers = new Map<number, (msg: string) => void>();
  private readonly handlers = new Map<
    number,
    Map<string, (request: Uint8Array) => Promise<Uint8Array>>
  >();
  private readonly attachments = new Map<symbol, Attachment>();
  private workerHandle: WorkerHandle | undefined;
  private unrefed = false;
  private destroyed = false;

  private constructor(readonly binding: WasmFfiBinding) {}

  /** A thread for instances; nothing is spawned until one is loaded. */
  static create(binding: WasmFfiBinding): ServiceThread {
    return new ServiceThread(binding);
  }

  /** The worker the wasm modules run on, spawned with the first. */
  private get worker(): WorkerHandle {
    if (!this.workerHandle) {
      const worker = this.binding.createMainWorker();
      worker.onMessage((msg) => this.onMessage(msg));
      worker.onError((err) => this.failAll(err));
      if (this.unrefed) {
        worker.unref();
      }
      this.workerHandle = worker;
    }
    return this.workerHandle;
  }

  /**
   * @internal Something living and ending with this thread under `key`, made by `create` the first
   * time it is asked for: the native thread its napi instances run on.
   */
  attachment<T extends Attachment>(key: symbol, create: () => T): T {
    if (this.destroyed) {
      throw new Error("service thread destroyed");
    }
    let attached = this.attachments.get(key);
    if (!attached) {
      attached = create();
      this.attachments.set(key, attached);
    }
    return attached as T;
  }

  /** @internal Load a module into a new slot; host-call targets are already described for it. */
  async load(
    source: WorkerInstanceSource,
    hostCall: HostCallTargets | undefined,
    logger: ((msg: string) => void) | undefined,
  ): Promise<number> {
    if (this.destroyed) {
      throw new Error("service thread destroyed");
    }
    const slot = this.nextSlot++;
    const targets: Record<string, { sibling?: number }> = {};
    const handlers = new Map<
      string,
      (request: Uint8Array) => Promise<Uint8Array>
    >();
    for (const [name, target] of Object.entries(hostCall ?? {})) {
      const unwrapped = unwrapTarget(target);
      const sibling =
        typeof (unwrapped as Partial<WasmFfiBackend>).slotOn === "function"
          ? (unwrapped as WasmFfiBackend).slotOn(this)
          : undefined;
      if (sibling !== undefined) {
        // Loaded before this one, so a chain of siblings can never come back round to itself.
        targets[name] = { sibling };
      } else {
        targets[name] = {};
        handlers.set(name, async (request) =>
          typeof unwrapped === "function"
            ? unwrapped(request)
            : unwrapped.call(request),
        );
      }
    }
    this.handlers.set(slot, handlers);
    if (logger) {
      this.loggers.set(slot, logger);
    }
    await new Promise<Uint8Array>((resolve, reject) => {
      this.loading.set(slot, { resolve, reject });
      this.worker.postMessage({
        type: "load",
        slot,
        ...source,
        hostCall: targets,
      });
    });
    return slot;
  }

  /** @internal */
  call(slot: number, input: Uint8Array): Promise<Uint8Array> {
    if (this.destroyed) {
      return Promise.reject(new Error("service thread destroyed"));
    }
    const id = ++this.seq;
    // A private copy so the request can be transferred rather than cloned. Not `slice()`: on a
    // node Buffer that aliases the caller's (pooled) memory, which the transfer would detach.
    const copy = new Uint8Array(input.byteLength);
    copy.set(input);
    return new Promise<Uint8Array>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ type: "call", slot, id, input: copy }, [
        copy.buffer,
      ]);
    });
  }

  /** @internal End one module; the others on the worker carry on. */
  async unload(slot: number): Promise<void> {
    if (this.destroyed) {
      return;
    }
    await new Promise<Uint8Array>((resolve, reject) => {
      this.loading.set(slot, { resolve, reject });
      this.worker.postMessage({ type: "unload", slot });
    });
    this.handlers.delete(slot);
    this.loggers.delete(slot);
  }

  private onMessage(msg: any): void {
    switch (msg?.type) {
      case "log":
        this.loggers.get(msg.slot)?.(msg.message);
        return;
      case "host-call":
        void this.answer(
          msg.slot,
          msg.id,
          msg.target,
          new Uint8Array(msg.request),
        );
        return;
      case "loaded":
      case "unloaded":
      case "load-error": {
        const pending = this.loading.get(msg.slot);
        this.loading.delete(msg.slot);
        if (msg.type === "load-error") {
          pending?.reject(new Error(`service thread: ${msg.message}`));
        } else {
          pending?.resolve(new Uint8Array());
        }
        return;
      }
      case "result":
      case "error": {
        const pending = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.type === "result") {
          pending?.resolve(new Uint8Array(msg.output));
        } else {
          pending?.reject(new Error(msg.message));
        }
        return;
      }
      default:
        return;
    }
  }

  /** Run the owner's handler for a module's host call and send the answer to the suspended module. */
  private async answer(
    slot: number,
    id: number,
    target: string,
    request: Uint8Array,
  ): Promise<void> {
    const handler = this.handlers.get(slot)?.get(target);
    let status = 0;
    let bytes: Uint8Array;
    try {
      if (!handler) {
        throw new Error(`no host-call target "${target}" is bound`);
      }
      bytes = await handler(request);
    } catch (e) {
      status = 1;
      bytes = new TextEncoder().encode(
        e instanceof Error ? e.message : String(e),
      );
    }
    // A private copy to transfer, for the reason `call` makes one.
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    this.worker.postMessage({ type: "host-answer", id, status, bytes: copy }, [
      copy.buffer,
    ]);
  }

  private failAll(err: unknown): void {
    const error =
      err instanceof Error ? err : new Error(`service thread: ${String(err)}`);
    for (const pending of [
      ...this.pending.values(),
      ...this.loading.values(),
    ]) {
      pending.reject(error);
    }
    this.pending.clear();
    this.loading.clear();
  }

  /**
   * Let the host process exit even while the worker is alive (node). A napi instance's native
   * thread holds the process only while a call to it is in flight anyway.
   */
  unref(): void {
    this.unrefed = true;
    this.workerHandle?.unref();
  }

  /** End the worker and the native thread, and every instance on them. */
  async destroy(): Promise<void> {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    const attachments = [...this.attachments.values()];
    this.attachments.clear();
    await Promise.all(attachments.map((a) => a.destroy()));
    const worker = this.workerHandle;
    if (!worker) {
      return;
    }
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
    this.failAll(new Error("wasm backend destroyed"));
  }
}

/**
 * Asynchronous FFI backend over a wasm module. Implements the runtime's `IpcClientAsync`, so the
 * generated `AsyncApi` sits on it exactly as it sits on a spawned process.
 */
export class WasmFfiBackend implements IpcClientAsync {
  private constructor(
    private readonly worker: ServiceThread,
    private readonly slot: number,
    /** Whether the worker is this backend's alone, ending with it. */
    private readonly ownsWorker: boolean,
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
    // Compile here so the (cached, streaming) compilation happens once and the compiled Module is
    // what crosses to the worker, rather than each side compiling the same bytes.
    const module = await compileWasmModule(opts.module, bound.platform);
    const ownsWorker = opts.worker === undefined;
    const worker = opts.worker ?? ServiceThread.create(bound);
    try {
      const slot = await worker.load(
        {
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
            ffiName: opts.ffiName,
          },
        },
        opts.hostCall,
        opts.logger,
      );
      return new WasmFfiBackend(worker, slot, ownsWorker);
    } catch (e) {
      if (ownsWorker) {
        await worker.destroy();
      }
      throw e;
    }
  }

  /** @internal This module's slot when it runs on `worker`. */
  slotOn(worker: ServiceThread): number | undefined {
    return this.worker === worker ? this.slot : undefined;
  }

  call(input: Uint8Array): Promise<Uint8Array> {
    return this.worker.call(this.slot, input);
  }

  /** Let the host process exit even while the module's workers are alive (node). */
  unref(): void {
    if (this.ownsWorker) {
      this.worker.unref();
    }
  }

  async destroy(): Promise<void> {
    if (this.ownsWorker) {
      await this.worker.destroy();
    } else {
      await this.worker.unload(this.slot);
    }
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
      await WasmFfiEngine.create(
        {
          threads: 1,
          ...opts,
          hostCall: hostCallOn(opts.hostCall, syncCallerOf),
        },
        binding,
      ),
    );
  }

  /** @internal */
  syncCaller(): (input: Uint8Array) => Uint8Array {
    return (input) => this.engine.call(input);
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

/** A module on the calling thread answers a host call synchronously, whichever backend wraps it. */
function syncCallerOf(
  backend: IpcClientAsync | IpcClientSync,
): ((request: Uint8Array) => Uint8Array) | undefined {
  const syncCaller = (backend as { syncCaller?: unknown }).syncCaller;
  return typeof syncCaller === "function"
    ? (syncCaller.call(backend) as
        ((request: Uint8Array) => Uint8Array) | undefined)
    : undefined;
}
