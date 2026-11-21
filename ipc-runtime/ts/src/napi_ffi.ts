import * as path from "node:path";
import {
  type NativeServiceThread,
  loadIpcRuntimeNapi,
} from "./native_loader.js";
import {
  AsyncInstanceBackend,
  type AsyncInstanceEvents,
  type AsyncInstancePort,
} from "./async_instance.js";
import type { IpcClientAsync, IpcClientSync } from "./types.js";
import {
  type HostCallTargets,
  hostCallOn,
  synchronousAnswers,
  unwrapTarget,
} from "./wasm/host_call.js";
import type { ServiceThread } from "./wasm/backend.js";

/** An instance of a library's service, opaque to JS. */
export type NapiInstance = { readonly __napiInstance: unique symbol };

/**
 * A service's shared library loaded in-process, through this package's Node-API addon. It makes
 * instances of the service (`<ffiName>_ipc_ffi_create`), each with state of its own, called on the
 * calling thread; their host calls are answered by the `hostCall` passed with each call.
 */
export interface NapiFfiLibrary {
  /** The name the library's FFI symbols carry. */
  ffiName: string;
  /** The library file, resolved. */
  libraryPath: string;
  /**
   * Whether it exports asynchronous instances (\`<ffiName>_ipc_ffi_create_async\` and the rest):
   * an asynchronous backend then runs on one, which keeps taking calls while its host calls are out.
   */
  asynchronous: boolean;
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
   * Where the instance runs, for the asynchronous backend: the native thread of a ServiceThread,
   * shared with the other napi instances on it, which can then be its host-call targets directly;
   * default a native thread of its own.
   */
  worker?: ServiceThread;
  /** The services the instance reaches through its host (see HostCallTarget). */
  hostCall?: HostCallTargets;
  logger?: (msg: string) => void;
}

/**
 * Load the shared library at `libraryPath` and bind its `<ffiName>_ipc_ffi_*` symbols, through this
 * package's Node-API addon. The library is loaded once per process however often it is loaded
 * here; its instances share nothing. `addonPath` overrides where the addon is found.
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
    asynchronous: library.hasAsyncInstances(),
    createInstance: () => library.createInstance() as NapiInstance,
    callInstance: (instance, input, hostCall) =>
      library.callInstance(instance, input, hostCall),
    destroyInstance: (instance) => library.destroyInstance(instance),
  };
}

function asUint8Array(buffer: Uint8Array): Uint8Array {
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

/**
 * A native thread hosting instances of services' shared libraries, each in a slot of its own, for
 * asynchronous calls. A call is queued to the thread, which runs it (one at a time across its
 * instances) and settles its promise with one wake of the event loop; no JS runs on the thread. An
 * instance's host call to another instance on the thread is a direct call there; any other is
 * answered by its handler on the event loop, the thread blocking until it is. So a handler must not
 * wait on a call to an instance on the same thread.
 *
 * The thread holds the process open only while something on it is in flight.
 */
export class NapiServiceThread {
  private readonly native: NativeServiceThread;
  private readonly handlers = new Map<
    number,
    Map<string, (request: Uint8Array) => Uint8Array | Promise<Uint8Array>>
  >();
  private readonly asyncEvents = new Map<number, AsyncInstanceEvents>();
  private destroyed = false;

  constructor(addonPath?: string) {
    const { ServiceThread } = loadIpcRuntimeNapi(addonPath);
    this.native = new ServiceThread(
      (slot, target, request, token) =>
        this.onHostCall(slot, target, request, token),
      (slot, kind, id, target, bytes) => {
        const events = this.asyncEvents.get(slot);
        if (kind === 0) {
          events?.respond(id, bytes);
        } else {
          events?.call(id, target, bytes);
        }
      },
    );
  }

  /**
   * @internal A new asynchronous instance of the library's service, in a slot of its own: its
   * requests and the answers to its host calls queue to the thread, and it reports to \`events\`.
   */
  async openAsync(
    library: NapiFfiLibrary,
    events: AsyncInstanceEvents,
  ): Promise<AsyncInstancePort> {
    const slot = await this.native.loadAsync(
      library.libraryPath,
      library.ffiName,
    );
    this.asyncEvents.set(slot, events);
    return {
      submit: (requestId, request) =>
        this.native.submit(slot, requestId, request),
      deliver: (callId, status, response) =>
        this.native.deliver(slot, callId, status, response),
      destroy: async () => {
        this.asyncEvents.delete(slot);
        await this.unload(slot);
      },
    };
  }

  /** @internal A new instance of the library's service, in a slot of its own. */
  async load(
    library: NapiFfiLibrary,
    hostCall: HostCallTargets | undefined,
  ): Promise<number> {
    const siblings: Record<string, number> = {};
    const handlers = new Map<
      string,
      (request: Uint8Array) => Uint8Array | Promise<Uint8Array>
    >();
    for (const [name, target] of Object.entries(hostCall ?? {})) {
      const unwrapped = unwrapTarget(target);
      const sibling =
        unwrapped instanceof NapiFfiBackend
          ? unwrapped.slotOnThread(this)
          : undefined;
      if (sibling !== undefined) {
        siblings[name] = sibling;
      } else {
        handlers.set(name, (request) =>
          typeof unwrapped === "function"
            ? unwrapped(request)
            : unwrapped.call(request),
        );
      }
    }
    const slot = await this.native.load(
      library.libraryPath,
      library.ffiName,
      siblings,
    );
    this.handlers.set(slot, handlers);
    return slot;
  }

  /** @internal */
  call(slot: number, input: Uint8Array): Promise<Uint8Array> {
    return this.native.call(slot, input);
  }

  /** @internal End one instance; the others on the thread carry on. */
  async unload(slot: number): Promise<void> {
    if (this.destroyed) {
      return;
    }
    await this.native.unload(slot);
    this.handlers.delete(slot);
  }

  /** End the thread and every instance on it. */
  async destroy(): Promise<void> {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    await this.native.destroy();
    this.handlers.clear();
  }

  private onHostCall(
    slot: number,
    target: string,
    request: Uint8Array,
    token: unknown,
  ): void {
    const fail = (e: unknown) =>
      this.native.answer(
        token,
        1,
        new TextEncoder().encode(e instanceof Error ? e.message : String(e)),
      );
    try {
      const handler = this.handlers.get(slot)?.get(target);
      if (!handler) {
        throw new Error(`no host-call target "${target}" is bound`);
      }
      const answer = handler(request);
      if (answer instanceof Uint8Array) {
        this.native.answer(token, 0, answer);
      } else {
        answer.then((bytes) => this.native.answer(token, 0, bytes), fail);
      }
    } catch (e) {
      fail(e);
    }
  }
}

const NAPI_THREAD = Symbol("ipc-runtime napi thread");

/**
 * An instance of the library's service on a native thread: state of its own, its calls run on that
 * thread, one at a time across the thread's instances.
 */
export async function createNapiFfiBackend(
  options: NapiInstanceOptions,
): Promise<NapiFfiBackend> {
  const library = loadNapiFfiLibrary(options.libraryPath, options.ffiName);
  const ownsThread = options.worker === undefined;
  const thread = options.worker
    ? options.worker.attachment(NAPI_THREAD, () => new NapiServiceThread())
    : new NapiServiceThread();
  try {
    if (library.asynchronous) {
      const backend = await AsyncInstanceBackend.create(
        (events) => thread.openAsync(library, events),
        options.hostCall,
      );
      return new NapiFfiBackend(thread, -1, ownsThread, backend);
    }
    const slot = await thread.load(library, options.hostCall);
    return new NapiFfiBackend(thread, slot, ownsThread);
  } catch (e) {
    if (ownsThread) {
      await thread.destroy();
    }
    throw e;
  }
}

/** An instance of a library's service on a native thread (createNapiFfiBackend). */
export class NapiFfiBackend implements IpcClientAsync {
  /** @internal */
  constructor(
    private readonly thread: NapiServiceThread,
    private readonly slot: number,
    private readonly ownsThread: boolean,
    /** Set when the instance is an asynchronous one. */
    private readonly asyncBackend?: AsyncInstanceBackend,
  ) {}

  /**
   * @internal This instance's slot when it runs on \`thread\`, for host-call targets beside it. An
   * asynchronous instance is reached through JS instead.
   */
  slotOnThread(thread: NapiServiceThread): number | undefined {
    return this.thread === thread && !this.asyncBackend ? this.slot : undefined;
  }

  call(input: Uint8Array): Promise<Uint8Array> {
    return this.asyncBackend
      ? this.asyncBackend.call(input)
      : this.thread.call(this.slot, input);
  }

  /** A no-op: the native thread holds the process only while a call to it is in flight. */
  unref(): void {}

  async destroy(): Promise<void> {
    if (this.asyncBackend) {
      await this.asyncBackend.destroy();
      if (this.ownsThread) {
        await this.thread.destroy();
      }
      return;
    }
    if (this.ownsThread) {
      await this.thread.destroy();
    } else {
      await this.thread.unload(this.slot);
    }
  }
}

/**
 * An instance of the library's service on the calling thread. Its host calls are answered on this
 * thread, so they must answer synchronously.
 */
export function createNapiFfiBackendSync(
  options: Omit<NapiInstanceOptions, "worker" | "logger">,
): NapiFfiBackendSync {
  const library = loadNapiFfiLibrary(options.libraryPath, options.ffiName);
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
  return new NapiFfiBackendSync(library, library.createInstance(), hostCall);
}

/** An instance of a library's service on the calling thread (createNapiFfiBackendSync). */
export class NapiFfiBackendSync implements IpcClientSync {
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
