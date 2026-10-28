import type { IpcClientAsync, IpcClientSync } from "../types.js";
import { WasmInstanceHost } from "./host.js";
import {
  type HostCallTargets,
  answerHostCall,
  createHostCallChannel,
  synchronousHostCall,
  unwrapTarget,
} from "./host_call.js";
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
  /** FFI entry export; default: the module's one `<service>_ipc_ffi_entry` export. */
  entry?: string;
  /** The services the module's `ipc_runtime.host_call` reaches, by target name (see `HostCallTarget`). */
  hostCall?: HostCallTargets;
}

/** What the engine is given: the host calls already resolved to a synchronous answer. */
export interface WasmEngineOptions extends Omit<WasmFfiOptions, "hostCall"> {
  hostCall?: (target: string, request: Uint8Array) => Uint8Array;
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
   * Where the main instance runs. Default (true): a dedicated worker, so a long call never blocks
   * the caller's event loop and, in browsers, the thread pool is spawned from a worker. A
   * `ServiceThread`: that thread, shared with the other instances loaded on it, which can then be
   * each other's host-call targets with no message passing between them. False: the calling thread,
   * and every call blocks it until it returns.
   */
  worker?: boolean | ServiceThread;
  /** Override the worker factories the platform entry binds. */
  createThreadWorker?: () => WorkerHandle;
  createMainWorker?: () => WorkerHandle;
}

const SERVICE_THREAD = Symbol.for(
  "@aztec-foundation/ipc-runtime/service-thread",
);

/** What a worker slot runs: a wasm module's main instance, or an instance of the napi addon at a path (node). */
export type WorkerInstanceSource =
  | {
      module: WebAssembly.Module;
      options: Omit<WasmFfiOptions, "module" | "hostCall" | "logger">;
    }
  | { napi: string };

export function isServiceThread(value: unknown): value is ServiceThread {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[SERVICE_THREAD] === true
  );
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
      entry: opts.entry,
      threads,
      spawnThread: (startArg) => threadWorkers?.spawn(startArg) ?? -1,
      hostCall: opts.hostCall,
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
 * A worker thread hosting service instances, each in a slot of its own: wasm modules' main
 * instances, and instances of napi addons (node). The instances on one thread run one call at a
 * time between them, and an instance can reach another as a host-call target directly, as a
 * synchronous call. Handlers of the owner's own answer through a shared channel while the thread
 * waits for them.
 *
 * An instance is loaded with `WasmFfiBackend.create({ worker })` or
 * `NapiFfiBackend.instance({ worker })`; the thread lives until `destroy()`, which ends every
 * instance on it.
 */
export class ServiceThread {
  /** Recognised by brand rather than instanceof, so two copies of this package in one app agree. */
  readonly [SERVICE_THREAD] = true;
  private nextSlot = 0;
  private seq = 0;
  private readonly pending = new Map<number, Pending>();
  private readonly loading = new Map<number, Pending>();
  private readonly loggers = new Map<number, (msg: string) => void>();
  private readonly handlers = new Map<
    number,
    Map<string, (request: Uint8Array) => Promise<Uint8Array>>
  >();
  private destroyed = false;

  private constructor(
    private readonly worker: WorkerHandle,
    private readonly channel: SharedArrayBuffer,
    readonly binding: WasmFfiBinding,
  ) {
    worker.onMessage((msg) => this.onMessage(msg));
    worker.onError((err) => this.failAll(err));
  }

  /** Spawn the worker; nothing runs on it until a module is loaded. */
  static create(binding: WasmFfiBinding): ServiceThread {
    const channel = createHostCallChannel();
    const worker = binding.createMainWorker();
    worker.postMessage({ type: "channel", channel });
    return new ServiceThread(worker, channel, binding);
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
        void this.answer(msg.slot, msg.target, new Uint8Array(msg.request));
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

  /** Run the owner's handler for a module's host call and hand the answer to the waiting worker. */
  private async answer(
    slot: number,
    target: string,
    request: Uint8Array,
  ): Promise<void> {
    const handler = this.handlers.get(slot)?.get(target);
    try {
      if (!handler) {
        throw new Error(`no host-call target "${target}" is bound`);
      }
      answerHostCall(this.channel, 0, await handler(request));
    } catch (e) {
      answerHostCall(
        this.channel,
        1,
        new TextEncoder().encode(e instanceof Error ? e.message : String(e)),
      );
    }
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

  /** Let the host process exit even while the worker is alive (node). */
  unref(): void {
    this.worker.unref();
  }

  /** End the worker and every module on it. */
  async destroy(): Promise<void> {
    if (this.destroyed) {
      return;
    }
    const done = new Promise<void>((resolve) => {
      this.worker.onMessage((msg) => {
        if (msg?.type === "destroyed") {
          resolve();
        }
      });
    });
    this.worker.postMessage({ type: "destroy" });
    await Promise.race([done, new Promise((r) => setTimeout(r, 2000))]);
    this.destroyed = true;
    await this.worker.terminate();
    this.failAll(new Error("wasm backend destroyed"));
  }
}

/**
 * Asynchronous FFI backend over a wasm module. Implements the runtime's `IpcClientAsync`, so the
 * generated `AsyncApi` sits on it exactly as it sits on a spawned process.
 */
export class WasmFfiBackend implements IpcClientAsync {
  private constructor(
    private readonly engine: WasmFfiEngine | undefined,
    private readonly worker: ServiceThread | undefined,
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
    if (opts.worker === false) {
      return new WasmFfiBackend(
        await WasmFfiEngine.create(
          {
            ...opts,
            hostCall: synchronousHostCall(opts.hostCall, syncCallerOf),
          },
          bound,
        ),
        undefined,
        -1,
        false,
      );
    }
    // Compile here so the (cached, streaming) compilation happens once and the compiled Module is
    // what crosses to the worker, rather than each side compiling the same bytes.
    const module = await compileWasmModule(opts.module, bound.platform);
    const ownsWorker = !isServiceThread(opts.worker);
    const worker = isServiceThread(opts.worker)
      ? opts.worker
      : ServiceThread.create(bound);
    try {
      const slot = await worker.load(
        {
          module,
          options: {
            threads: opts.threads,
            memory: opts.memory,
            env: opts.env,
            entry: opts.entry,
          },
        },
        opts.hostCall,
        opts.logger,
      );
      return new WasmFfiBackend(undefined, worker, slot, ownsWorker);
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

  /** @internal A synchronous call into the module, when it runs on the calling thread. */
  syncCaller(): ((input: Uint8Array) => Uint8Array) | undefined {
    const engine = this.engine;
    return engine && ((input) => engine.call(input));
  }

  call(input: Uint8Array): Promise<Uint8Array> {
    if (this.engine) {
      try {
        return Promise.resolve(this.engine.call(input));
      } catch (e) {
        return Promise.reject(e);
      }
    }
    return this.worker!.call(this.slot, input);
  }

  /** Let the host process exit even while the module's workers are alive (node). */
  unref(): void {
    this.engine?.unref();
    if (this.ownsWorker) {
      this.worker?.unref();
    }
  }

  async destroy(): Promise<void> {
    if (this.engine) {
      await this.engine.destroy();
      return;
    }
    if (this.ownsWorker) {
      await this.worker!.destroy();
    } else {
      await this.worker!.unload(this.slot);
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
          hostCall: synchronousHostCall(opts.hostCall, syncCallerOf),
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
