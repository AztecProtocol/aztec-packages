import type { IpcClientAsync } from "./types.js";
import { type HostCallTargets, unwrapTarget } from "./wasm/host_call.js";

/**
 * What an asynchronous instance tells its host: the response to a submitted request, or a call
 * out to a host-call target, whose answer goes back with deliver(). Whatever runs the instance (a
 * wasm module, a native library over Node-API or JSI) reports these, on the JavaScript thread.
 */
export interface AsyncInstanceEvents {
  respond(requestId: number, response: Uint8Array): void;
  call(callId: number, target: string, request: Uint8Array): void;
}

/**
 * An asynchronous instance of a service (its library's `<ffi>_ipc_ffi_create_async`,
 * `_submit`, `_deliver` and `_destroy_async`), as whatever runs it exposes it. None of these is
 * called from inside an event: the backend queues events and acts on them afterwards.
 */
export interface AsyncInstancePort {
  submit(requestId: number, request: Uint8Array): void;
  /** 0 and the target's response, or non-zero and a message saying why the call failed. */
  deliver(callId: number, status: number, response: Uint8Array): void;
  destroy(): void | Promise<void>;
}

/**
 * A service's asynchronous instance as a backend. Its handlers' host calls are answered by
 * `hostCall`'s targets while it keeps taking calls, so a target may call back into this same
 * backend (nested calls) or any other, and many calls may be in flight on it at once.
 */
export class AsyncInstanceBackend implements IpcClientAsync {
  private readonly pending = new Map<
    number,
    { resolve(response: Uint8Array): void; reject(err: Error): void }
  >();
  private nextRequestId = 1;
  private readonly queue: Array<() => void> = [];
  private draining = false;
  private destroyed = false;
  private port!: AsyncInstancePort;

  private constructor(private readonly hostCall: HostCallTargets | undefined) {}

  /** `open` makes the instance, reporting its events to the events it is given. */
  static async create(
    open: (
      events: AsyncInstanceEvents,
    ) => AsyncInstancePort | Promise<AsyncInstancePort>,
    hostCall?: HostCallTargets,
  ): Promise<AsyncInstanceBackend> {
    const backend = new AsyncInstanceBackend(hostCall);
    backend.port = await open(backend.events());
    return backend;
  }

  /** create(), for an `open` that makes the instance at once. */
  static createNow(
    open: (events: AsyncInstanceEvents) => AsyncInstancePort,
    hostCall?: HostCallTargets,
  ): AsyncInstanceBackend {
    const backend = new AsyncInstanceBackend(hostCall);
    backend.port = open(backend.events());
    return backend;
  }

  private events(): AsyncInstanceEvents {
    return {
      respond: (requestId, response) =>
        this.enqueue(() => this.onRespond(requestId, response)),
      call: (callId, target, request) =>
        this.enqueue(() => this.onCall(callId, target, request)),
    };
  }

  call(input: Uint8Array): Promise<Uint8Array> {
    if (this.destroyed) {
      return Promise.reject(
        new Error("asynchronous instance used after destroy()"),
      );
    }
    const requestId = this.nextRequestId++;
    return new Promise<Uint8Array>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      // Through the queue, like everything else that calls into the instance: a call made from
      // inside an event (a synchronous target answering by calling this backend) waits its turn.
      this.enqueue(() => this.port.submit(requestId, input));
    });
  }

  async destroy(): Promise<void> {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    for (const { reject } of this.pending.values()) {
      reject(new Error("asynchronous instance destroyed"));
    }
    this.pending.clear();
    await this.port.destroy();
  }

  /** Runs `task` after whatever is running, never inside a call into the instance. */
  private enqueue(task: () => void): void {
    this.queue.push(task);
    if (!this.draining) {
      this.draining = true;
      // A promise job rather than queueMicrotask, which not every Hermes has.
      void Promise.resolve().then(() => this.drain());
    }
  }

  private drain(): void {
    try {
      for (let task = this.queue.shift(); task; task = this.queue.shift()) {
        if (!this.destroyed) {
          task();
        }
      }
    } finally {
      this.draining = false;
    }
  }

  private onRespond(requestId: number, response: Uint8Array): void {
    const pending = this.pending.get(requestId);
    this.pending.delete(requestId);
    pending?.resolve(response);
  }

  private onCall(callId: number, target: string, request: Uint8Array): void {
    void this.answer(target, request).then(
      (response) => this.enqueue(() => this.port.deliver(callId, 0, response)),
      (err: unknown) =>
        this.enqueue(() =>
          this.port.deliver(
            callId,
            1,
            new TextEncoder().encode(
              err instanceof Error ? err.message : String(err),
            ),
          ),
        ),
    );
  }

  private async answer(
    target: string,
    request: Uint8Array,
  ): Promise<Uint8Array> {
    const bound = this.hostCall?.[target];
    if (!bound) {
      throw new Error(`no host-call target "${target}" is bound`);
    }
    const unwrapped = unwrapTarget(bound);
    return typeof unwrapped === "function"
      ? await unwrapped(request)
      : await unwrapped.call(request);
  }
}
