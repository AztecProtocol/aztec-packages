import * as path from "node:path";
import { loadIpcRuntimeNapi } from "./native_loader.js";
import type { IpcClientAsync, IpcClientSync } from "./types.js";
import {
  type HostCallTargets,
  hostCallOn,
  synchronousAnswers,
} from "./wasm/host_call.js";
import { type WasmWorker, isWasmWorker } from "./wasm/backend.js";

/** An instance of a library's service, opaque to JS. */
export type NapiInstance = { readonly __napiInstance: unique symbol };

/**
 * A service's shared library loaded in-process, through this package's Node-API addon. `call` and
 * `callAsync` go to the process's one instance (`<ffiName>_ipc_ffi_entry`), serialized as the FFI
 * entry requires. A library generated with instances also makes instances of the service, each
 * with state of its own, called on the calling thread; their host calls are answered by the
 * `hostCall` passed with each call.
 */
export interface NapiFfiLibrary {
  /** The name the library's FFI symbols carry. */
  ffiName: string;
  /** The library file, resolved. */
  libraryPath: string;
  /** Whether the library exports FFI instances (`<ffiName>_ipc_ffi_create` and the rest). */
  hasInstances: boolean;
  call(input: Uint8Array): Uint8Array;
  callAsync(input: Uint8Array): Promise<Uint8Array>;
  createInstance(): NapiInstance;
  callInstance(
    instance: NapiInstance,
    input: Uint8Array,
    hostCall?: (target: string, request: Uint8Array) => Uint8Array,
  ): Uint8Array;
  destroyInstance(instance: NapiInstance): void;
}

/** Options for a napi backend over an instance of a library's service. */
export interface NapiInstanceOptions {
  /** The library file. */
  libraryPath: string;
  /** The name the library's FFI symbols carry. */
  ffiName: string;
  /**
   * Where the instance runs, for the asynchronous backend: a WasmWorker shared with the other
   * instances on it (wasm modules or napi instances), which can then be its host-call targets
   * synchronously; default a worker of its own.
   */
  worker?: WasmWorker;
  /** The services the instance reaches through its host (see HostCallTarget). */
  hostCall?: HostCallTargets;
  logger?: (msg: string) => void;
}

/**
 * Load the shared library at `libraryPath` and bind its `<ffiName>_ipc_ffi_*` symbols, through this
 * package's Node-API addon. The library is loaded once per process however often it is loaded
 * here, so `call`/`callAsync` from every backend over one file share the process instance's state.
 * `addonPath` overrides where the addon is found.
 */
export function loadNapiFfiLibrary(
  libraryPath: string,
  ffiName: string,
  addonPath?: string,
): NapiFfiLibrary {
  const { FfiLibrary } = loadIpcRuntimeNapi(addonPath);
  const resolved = path.resolve(libraryPath);
  const library = new FfiLibrary(resolved, ffiName);
  return {
    ffiName,
    libraryPath: resolved,
    hasInstances: library.hasInstances(),
    call: (input) => library.call(input),
    callAsync: (input) => library.callAsync(input),
    createInstance: () => library.createInstance() as NapiInstance,
    callInstance: (instance, input, hostCall) =>
      library.callInstance(instance, input, hostCall),
    destroyInstance: (instance) => library.destroyInstance(instance),
  };
}

function asUint8Array(buffer: Uint8Array): Uint8Array {
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

function requireInstances(library: NapiFfiLibrary): void {
  if (!library.hasInstances) {
    throw new Error(
      `${library.libraryPath}: the library has no FFI instances (regenerate it)`,
    );
  }
}

/** Asynchronous backend over a library's process instance: each call runs on the libuv thread pool. */
export class NapiFfiBackend implements IpcClientAsync {
  private destroyed = false;

  constructor(private readonly library: NapiFfiLibrary) {}

  /**
   * An instance of its own on a worker: the backend then has state of its own, and its calls run on
   * that worker's thread, one at a time, as a wasm module's do. `createWorker` binds the platform's
   * worker scripts.
   */
  static async instance(
    options: NapiInstanceOptions,
    createWorker: () => WasmWorker,
  ): Promise<NapiInstanceBackend> {
    const library = loadNapiFfiLibrary(options.libraryPath, options.ffiName);
    requireInstances(library);
    const ownsWorker = !isWasmWorker(options.worker);
    const worker = options.worker ?? createWorker();
    try {
      const slot = await worker.load(
        {
          napi: { libraryPath: library.libraryPath, ffiName: library.ffiName },
        },
        options.hostCall,
        options.logger,
      );
      return new NapiInstanceBackend(worker, slot, ownsWorker);
    } catch (e) {
      if (ownsWorker) {
        await worker.destroy();
      }
      throw e;
    }
  }

  async call(input: Uint8Array): Promise<Uint8Array> {
    if (this.destroyed) {
      throw new Error(
        `${this.library.ffiName}: napi backend used after destroy()`,
      );
    }
    return asUint8Array(await this.library.callAsync(input));
  }

  /** The library stays loaded; this only stops further calls. */
  destroy(): Promise<void> {
    this.destroyed = true;
    return Promise.resolve();
  }
}

/** An instance of a library's service on a worker (NapiFfiBackend.instance). */
export class NapiInstanceBackend implements IpcClientAsync {
  /** @internal */
  constructor(
    private readonly worker: WasmWorker,
    private readonly slot: number,
    private readonly ownsWorker: boolean,
  ) {}

  /** @internal This instance's slot when it runs on `worker`, for host-call targets beside it. */
  slotOn(worker: WasmWorker): number | undefined {
    return this.worker === worker ? this.slot : undefined;
  }

  call(input: Uint8Array): Promise<Uint8Array> {
    return this.worker.call(this.slot, input);
  }

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

/** Synchronous backend over a library's process instance: each call runs on, and blocks, the calling thread. */
export class NapiFfiBackendSync implements IpcClientSync {
  private destroyed = false;

  constructor(private readonly library: NapiFfiLibrary) {}

  /**
   * An instance of its own on the calling thread. Its host calls are answered on this thread, so
   * they must answer synchronously.
   */
  static instance(
    options: Omit<NapiInstanceOptions, "worker" | "logger">,
  ): NapiInstanceBackendSync {
    const library = loadNapiFfiLibrary(options.libraryPath, options.ffiName);
    requireInstances(library);
    const hostCall = synchronousAnswers(
      hostCallOn(options.hostCall, (backend) => {
        const syncCaller = (backend as { syncCaller?: unknown }).syncCaller;
        return typeof syncCaller === "function"
          ? (syncCaller.call(backend) as
              | ((request: Uint8Array) => Uint8Array)
              | undefined)
          : undefined;
      }),
    );
    return new NapiInstanceBackendSync(
      library,
      library.createInstance(),
      hostCall,
    );
  }

  call(input: Uint8Array): Uint8Array {
    if (this.destroyed) {
      throw new Error(
        `${this.library.ffiName}: napi backend used after destroy()`,
      );
    }
    return asUint8Array(this.library.call(input));
  }

  destroy(): void {
    this.destroyed = true;
  }
}

/** An instance of a library's service on the calling thread (NapiFfiBackendSync.instance). */
export class NapiInstanceBackendSync implements IpcClientSync {
  private destroyed = false;

  /** @internal */
  constructor(
    private readonly library: NapiFfiLibrary,
    private readonly instance: NapiInstance,
    private readonly hostCall:
      | ((target: string, request: Uint8Array) => Uint8Array)
      | undefined,
  ) {}

  /** @internal A synchronous call into the instance, for a host-call target on this thread. */
  syncCaller(): (input: Uint8Array) => Uint8Array {
    return (input) => this.call(input);
  }

  call(input: Uint8Array): Uint8Array {
    if (this.destroyed) {
      throw new Error(
        `${this.library.ffiName}: napi backend used after destroy()`,
      );
    }
    return asUint8Array(
      this.library.callInstance(this.instance, input, this.hostCall),
    );
  }

  destroy(): void {
    if (!this.destroyed) {
      this.destroyed = true;
      this.library.destroyInstance(this.instance);
    }
  }
}
