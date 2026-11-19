import type { IpcClientAsync, IpcClientSync } from "../types.js";
import type { HostCallAnswer } from "./host.js";

/**
 * A module's `ipc_runtime.host_call` reaches the services its host binds by name (the module's
 * C++ side names them through `ipc_codegen::HostCallBackend("<target>")`). A target is bound to:
 *   - another module's backend: on the same worker it is called directly, module to module, with
 *     no message passing; anywhere else it is called like any other backend;
 *   - any backend (`call(bytes)`), or a generated service over one, such as a spawned process;
 *   - a function of the caller's own, from request bytes to response bytes.
 * The response is the service's own bytes, error responses included: the module's generated
 * client decodes them as it would over any transport.
 *
 * An asynchronous backend's module may be answered asynchronously: JSPI suspends the module's
 * stack until the answer settles, on a worker or on the calling thread alike. A handler answering a
 * module on a worker must not wait on a module of that same worker, since the worker runs one call
 * at a time and cannot serve it until the handler returns. A synchronous backend's module can only
 * take synchronous answers.
 */
export type HostCallHandler = (
  request: Uint8Array,
) => Uint8Array | Promise<Uint8Array>;

/**
 * The backend behind a generated service object, so a service can be bound as a host-call target
 * as it is; the generated service classes define it.
 */
export const SERVICE_BACKEND = Symbol.for(
  "@aztec-foundation/ipc-runtime/service-backend",
);

export type HostCallTarget =
  | HostCallHandler
  | IpcClientAsync
  | IpcClientSync
  | { readonly [SERVICE_BACKEND]: IpcClientAsync | IpcClientSync };

/** Host-call targets by the name the module calls them by. */
export type HostCallTargets = Record<string, HostCallTarget>;

/** The function or backend a target stands for, with any service object unwrapped. */
export function unwrapTarget(
  target: HostCallTarget,
): HostCallHandler | IpcClientAsync | IpcClientSync {
  if (typeof target === "function") {
    return target;
  }
  if (SERVICE_BACKEND in target) {
    return target[SERVICE_BACKEND];
  }
  return target;
}

/**
 * Host calls answered on the thread the module runs on, each target by its function or its backend
 * (`callerOf` picks a backend's synchronous caller where it has one, so a synchronous module can
 * reach it).
 */
export function hostCallOn(
  targets: HostCallTargets | undefined,
  callerOf: (
    backend: IpcClientAsync | IpcClientSync,
  ) => ((request: Uint8Array) => Uint8Array) | undefined,
): HostCallAnswer | undefined {
  if (!targets) {
    return undefined;
  }
  const callers = new Map<
    string,
    (request: Uint8Array) => Uint8Array | Promise<Uint8Array>
  >();
  for (const [name, target] of Object.entries(targets)) {
    const unwrapped = unwrapTarget(target);
    callers.set(
      name,
      typeof unwrapped === "function"
        ? unwrapped
        : (callerOf(unwrapped) ??
            ((request: Uint8Array) => unwrapped.call(request))),
    );
  }
  return (target, request) => {
    const call = callers.get(target);
    if (!call) {
      throw new Error(`no host-call target "${target}" is bound`);
    }
    return call(request);
  };
}
