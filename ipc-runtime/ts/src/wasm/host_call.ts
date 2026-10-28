import type { IpcClientAsync, IpcClientSync } from "../types.js";

/**
 * A module's `ipc_runtime.host_call` reaches the services its host binds by name (the module's
 * C++ side names them through `ipc_codegen::HostCallBackend("<target>")`). A target is bound to:
 *   - another module's backend: on the same worker it is called synchronously, module to module,
 *     with no message passing; anywhere else it is called like any other backend;
 *   - any backend (`call(bytes)`), or a generated service over one, such as a spawned process;
 *   - a function of the caller's own, from request bytes to response bytes.
 * The response is the service's own bytes, error responses included: the module's generated
 * client decodes them as it would over any transport.
 *
 * A module on a worker waits for an answer from its owner's thread blocked (`Atomics.wait`), so a
 * handler there may be asynchronous but must not wait on a module of that same worker: the worker
 * cannot serve it until the handler returns. A module on the calling thread can only take
 * synchronous answers.
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

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

/**
 * Host calls answered on the calling thread: each target must answer synchronously, because the
 * module is running on this thread and cannot wait for it to do anything else.
 */
export function synchronousHostCall(
  targets: HostCallTargets | undefined,
  syncCallerOf: (
    backend: IpcClientAsync | IpcClientSync,
  ) => ((request: Uint8Array) => Uint8Array) | undefined,
): ((target: string, request: Uint8Array) => Uint8Array) | undefined {
  if (!targets) {
    return undefined;
  }
  const callers = new Map<string, (request: Uint8Array) => Uint8Array>();
  for (const [name, target] of Object.entries(targets)) {
    const unwrapped = unwrapTarget(target);
    const call =
      typeof unwrapped === "function"
        ? unwrapped
        : (syncCallerOf(unwrapped) ??
          ((request: Uint8Array) => unwrapped.call(request)));
    callers.set(name, (request) => {
      const response = call(request);
      if (isThenable(response)) {
        // Nothing can settle it: the module holds this thread until it returns.
        void Promise.resolve(response).catch(() => {});
        throw new Error(
          `host call "${name}" answered asynchronously; a module on the calling thread needs ` +
            "synchronous answers (run it on a worker for asynchronous ones)",
        );
      }
      return response;
    });
  }
  return (target, request) => {
    const call = callers.get(target);
    if (!call) {
      throw new Error(`no host-call target "${target}" is bound`);
    }
    return call(request);
  };
}

/**
 * The channel a worker's modules get their owner's host-call answers through: a shared buffer
 * holding one answer at a time, which is enough because the worker sits blocked until it arrives.
 * Layout: int32 state (0 waiting, 1 answered), int32 status, int32 length, then the bytes. It grows
 * to fit an answer, up to MAX_ANSWER_BYTES.
 */
const HEADER_BYTES = 16;
const INITIAL_ANSWER_BYTES = 64 * 1024;
const MAX_ANSWER_BYTES = 1 << 30;
const ANSWERED = 1;

export function createHostCallChannel(): SharedArrayBuffer {
  // A growable SharedArrayBuffer (ES2024); every engine this runs on has them.
  return new (SharedArrayBuffer as unknown as new (
    length: number,
    options: { maxByteLength: number },
  ) => SharedArrayBuffer)(HEADER_BYTES + INITIAL_ANSWER_BYTES, {
    maxByteLength: HEADER_BYTES + MAX_ANSWER_BYTES,
  });
}

/** Owner side: write the answer and wake the worker. */
export function answerHostCall(
  channel: SharedArrayBuffer,
  status: number,
  bytes: Uint8Array,
): void {
  const growable = channel as SharedArrayBuffer & {
    grow(length: number): void;
    maxByteLength: number;
  };
  if (HEADER_BYTES + bytes.length > channel.byteLength) {
    if (HEADER_BYTES + bytes.length > growable.maxByteLength) {
      status = 1;
      bytes = new TextEncoder().encode(
        `host call answer of ${bytes.length} bytes exceeds ${MAX_ANSWER_BYTES}`,
      );
    } else {
      growable.grow(HEADER_BYTES + bytes.length);
    }
  }
  new Uint8Array(channel, HEADER_BYTES, bytes.length).set(bytes);
  const header = new Int32Array(channel, 0, 3);
  header[1] = status;
  header[2] = bytes.length;
  Atomics.store(header, 0, ANSWERED);
  Atomics.notify(header, 0);
}

/** Worker side: block until the owner answers, take the answer and reset the channel. */
export function awaitHostCallAnswer(channel: SharedArrayBuffer): {
  status: number;
  bytes: Uint8Array;
} {
  const header = new Int32Array(channel, 0, 3);
  while (Atomics.load(header, 0) !== ANSWERED) {
    Atomics.wait(header, 0, 0);
  }
  const status = header[1];
  const bytes = new Uint8Array(channel, HEADER_BYTES, header[2]).slice();
  Atomics.store(header, 0, 0);
  return { status, bytes };
}
