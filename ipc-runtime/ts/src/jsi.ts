import type { IpcClientAsync, IpcClientSync } from "./types.js";
import {
  type HostCallTargets,
  hostCallOn,
  synchronousAnswers,
} from "./wasm/host_call.js";

/**
 * React Native: a service's native library, linked into the app, reached through the JSI binding
 * (`ipc-runtime/cpp/jsi`), which the app's native module installs as `globalThis.__ipcRuntimeJsi`.
 * Hermes has no WebAssembly and no workers, so this is how a service runs there.
 */
interface JsiInstance {
  call(
    request: Uint8Array,
    hostCall?: (
      target: string,
      request: Uint8Array,
    ) => Uint8Array | Promise<Uint8Array>,
  ): Promise<Uint8Array>;
  destroy(): void;
}

interface JsiInstanceSync {
  callSync(
    request: Uint8Array,
    hostCall?: (target: string, request: Uint8Array) => Uint8Array,
  ): Uint8Array;
  destroy(): void;
}

interface JsiBinding {
  createInstance(ffiName: string, library?: string): JsiInstance;
  createInstanceSync(ffiName: string, library?: string): JsiInstanceSync;
}

function binding(): JsiBinding | undefined {
  return (globalThis as { __ipcRuntimeJsi?: JsiBinding }).__ipcRuntimeJsi;
}

/** Whether the JSI binding is installed: the app links ipc-runtime's React Native module. */
export function jsiAvailable(): boolean {
  return binding() !== undefined;
}

function requireBinding(ffiName: string): JsiBinding {
  const jsi = binding();
  if (!jsi) {
    throw new Error(
      `${ffiName}: the ipc-runtime JSI binding is not installed. Add @aztec-foundation/ipc-runtime-react-native ` +
        "to the app (it installs the binding when the app starts), and the native package of the service.",
    );
  }
  return jsi;
}

export interface JsiFfiOptions {
  /** The name the library's FFI symbols carry: `<ffiName>_ipc_ffi_*`. */
  ffiName: string;
  /** The library's file, when it is not lib<ffiName>.so (Android) and not registered by the app (iOS). */
  library?: string;
  /** The services the instance reaches through its host (see HostCallTarget). */
  hostCall?: HostCallTargets;
}

function syncCallerOf(
  backend: IpcClientAsync | IpcClientSync,
): ((request: Uint8Array) => Uint8Array) | undefined {
  const syncCaller = (backend as { syncCaller?: unknown }).syncCaller;
  return typeof syncCaller === "function"
    ? (syncCaller.call(backend) as (request: Uint8Array) => Uint8Array)
    : undefined;
}

/**
 * An instance of the library's service on a native thread of its own; calls return promises. Its
 * host calls are answered on the JavaScript thread, asynchronously if need be, while its thread
 * waits.
 */
export function createJsiFfiBackend(options: JsiFfiOptions): JsiFfiBackend {
  const instance = requireBinding(options.ffiName).createInstance(
    options.ffiName,
    options.library,
  );
  return new JsiFfiBackend(
    options.ffiName,
    instance,
    hostCallOn(options.hostCall, syncCallerOf),
  );
}

/** An instance on a native thread of its own (createJsiFfiBackend). */
export class JsiFfiBackend implements IpcClientAsync {
  private destroyed = false;

  /** @internal */
  constructor(
    private readonly ffiName: string,
    private readonly instance: JsiInstance,
    private readonly hostCall:
      | ((
          target: string,
          request: Uint8Array,
        ) => Uint8Array | Promise<Uint8Array>)
      | undefined,
  ) {}

  call(input: Uint8Array): Promise<Uint8Array> {
    if (this.destroyed) {
      return Promise.reject(
        new Error(`${this.ffiName}: JSI backend used after destroy()`),
      );
    }
    return this.instance.call(input, this.hostCall);
  }

  destroy(): Promise<void> {
    if (!this.destroyed) {
      this.destroyed = true;
      this.instance.destroy();
    }
    return Promise.resolve();
  }
}

/**
 * An instance of the library's service on the JavaScript thread: each call blocks it until the
 * service answers, and its host calls must answer synchronously.
 */
export function createJsiFfiBackendSync(
  options: JsiFfiOptions,
): JsiFfiBackendSync {
  const instance = requireBinding(options.ffiName).createInstanceSync(
    options.ffiName,
    options.library,
  );
  return new JsiFfiBackendSync(
    options.ffiName,
    instance,
    synchronousAnswers(hostCallOn(options.hostCall, syncCallerOf)),
  );
}

/** An instance on the JavaScript thread (createJsiFfiBackendSync). */
export class JsiFfiBackendSync implements IpcClientSync {
  private destroyed = false;

  /** @internal */
  constructor(
    private readonly ffiName: string,
    private readonly instance: JsiInstanceSync,
    private readonly hostCall:
      ((target: string, request: Uint8Array) => Uint8Array) | undefined,
  ) {}

  /** @internal A synchronous call into the instance, for a host-call target on this thread. */
  syncCaller(): (input: Uint8Array) => Uint8Array {
    return (input) => this.call(input);
  }

  call(input: Uint8Array): Uint8Array {
    if (this.destroyed) {
      throw new Error(`${this.ffiName}: JSI backend used after destroy()`);
    }
    return this.instance.callSync(input, this.hostCall);
  }

  destroy(): void {
    if (!this.destroyed) {
      this.destroyed = true;
      this.instance.destroy();
    }
  }
}
