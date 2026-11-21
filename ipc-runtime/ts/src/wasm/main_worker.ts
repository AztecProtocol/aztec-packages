import { type WasmFfiBinding, WasmFfiEngine } from "./backend.js";
import type { AsyncInstancePort } from "../async_instance.js";
import type { HostCallAnswer } from "./host.js";
import type { WasmPlatform, WorkerHandle, WorkerSide } from "./platform.js";

export interface MainWorkerOptions {
  /** Spawns the thread pool's workers (see `WasmFfiBinding` for why this is a factory). */
  createThreadWorker: () => WorkerHandle;
}

/**
 * Body of the worker hosting wasm modules (see `ServiceThread`): a module's main instance per
 * `load`, serve `call` requests, tear down on `unload` and `destroy`. Calls run to completion on
 * this worker's thread; the parent's event loop stays free.
 *
 * A module's host calls are answered here: a sibling is called directly, and anything else is asked
 * of the parent, the module waiting for the answer suspended (JSPI). Calls run one at a time across
 * the worker's modules: while one is suspended, a call into any of them could re-enter a module
 * mid-call through a sibling.
 */
export function runMainWorker(
  side: WorkerSide,
  platform: WasmPlatform,
  opts: MainWorkerOptions,
): void {
  const engines = new Map<number, WasmFfiEngine>();
  /**
   * The slots whose module has asynchronous instances: their calls are submitted to the instance
   * and answered by its respond events, and their host calls go out as events, answered by
   * deliver, so the module keeps taking calls (nested ones included) while host calls are out.
   */
  const asyncSlots = new Map<
    number,
    { port: AsyncInstancePort; responses: Map<number, (bytes: Uint8Array) => void> }
  >();
  let nextAsyncRequest = 1;

  /** A call into a slot's module, of whichever kind it is. */
  function callSlot(slot: number, input: Uint8Array): Promise<Uint8Array> {
    const asyncSlot = asyncSlots.get(slot);
    if (asyncSlot) {
      const requestId = nextAsyncRequest++;
      return new Promise<Uint8Array>((resolve) => {
        asyncSlot.responses.set(requestId, resolve);
        asyncSlot.port.submit(requestId, input);
      });
    }
    const engine = engines.get(slot);
    if (!engine) {
      return Promise.reject(new Error("wasm module is not loaded"));
    }
    return Promise.resolve(engine.callEither(input));
  }

  /** The asynchronous instance of a freshly loaded module whose calls go out by message. */
  function openAsyncSlot(
    slot: number,
    engine: WasmFfiEngine,
    hostCall: HostCallAnswer,
  ): void {
    const responses = new Map<number, (bytes: Uint8Array) => void>();
    const port = engine.openAsync({
      respond: (requestId, response) => {
        const resolve = responses.get(requestId);
        responses.delete(requestId);
        resolve?.(response);
      },
      // Answered after the instance returns (a sibling's call, the parent's message), never
      // from inside it.
      call: (callId, target, request) => {
        void Promise.resolve()
          .then(() => hostCall(target, request))
          .then(
            (bytes) => port.deliver(callId, 0, bytes),
            (e: unknown) =>
              port.deliver(
                callId,
                1,
                new TextEncoder().encode(
                  e instanceof Error ? e.message : String(e),
                ),
              ),
          );
      },
    });
    asyncSlots.set(slot, { port, responses });
  }
  const answers = new Map<
    number,
    { resolve: (bytes: Uint8Array) => void; reject: (err: Error) => void }
  >();
  let nextHostCall = 0;
  let queue: Promise<unknown> = Promise.resolve();
  const binding: WasmFfiBinding = {
    platform,
    createThreadWorker: opts.createThreadWorker,
    // Unused here: this worker is the main worker.
    createMainWorker: opts.createThreadWorker,
  };

  function hostCallFor(
    slot: number,
    targets: Record<string, { sibling?: number }>,
  ): HostCallAnswer {
    return (target, request) => {
      const bound = targets[target];
      if (!bound) {
        throw new Error(`no host-call target "${target}" is bound`);
      }
      if (bound.sibling !== undefined) {
        const sibling = engines.get(bound.sibling);
        if (!sibling) {
          throw new Error(
            `host-call target "${target}" is a module that is no longer loaded`,
          );
        }
        return callSlot(bound.sibling, request);
      }
      const id = nextHostCall++;
      const answer = new Promise<Uint8Array>((resolve, reject) =>
        answers.set(id, { resolve, reject }),
      );
      side.postMessage({ type: "host-call", slot, id, target, request }, [
        request.buffer as ArrayBuffer,
      ]);
      return answer;
    };
  }

  async function call(msg: { slot: number; id: number; input: ArrayBuffer }) {
    try {
      const output = await callSlot(msg.slot, new Uint8Array(msg.input));
      side.postMessage({ type: "result", id: msg.id, output }, [
        output.buffer as ArrayBuffer,
      ]);
    } catch (e) {
      side.postMessage({
        type: "error",
        id: msg.id,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  side.onMessage(async (msg) => {
    switch (msg?.type) {
      case "host-answer": {
        const pending = answers.get(msg.id);
        answers.delete(msg.id);
        if (msg.status === 0) {
          pending?.resolve(new Uint8Array(msg.bytes));
        } else {
          pending?.reject(new Error(new TextDecoder().decode(msg.bytes)));
        }
        break;
      }
      case "load": {
        const slot: number = msg.slot;
        try {
          const targets = msg.hostCall ?? {};
          const o = msg.options ?? {};
          const hostCall = hostCallFor(slot, targets);
          const engine = await WasmFfiEngine.create(
              {
                module: msg.module,
                threads: o.threads,
                memory: o.memory,
                moduleMemory: o.moduleMemory,
                env: o.env,
                ffiName: o.ffiName,
                logger: (message) =>
                  side.postMessage({ type: "log", slot, message }),
                hostCall,
                suspending: true,
              },
              binding,
            );
          engines.set(slot, engine);
          if (engine.asynchronous) {
            openAsyncSlot(slot, engine, hostCall);
          }
          side.postMessage({ type: "loaded", slot });
        } catch (e) {
          side.postMessage({
            type: "load-error",
            slot,
            message: e instanceof Error ? (e.stack ?? e.message) : String(e),
          });
        }
        break;
      }
      case "call":
        if (asyncSlots.has(msg.slot)) {
          void call(msg);
        } else {
          queue = queue.then(() => call(msg));
        }
        break;
      case "unload": {
        const engine = engines.get(msg.slot);
        engines.delete(msg.slot);
        asyncSlots.get(msg.slot)?.port.destroy();
        asyncSlots.delete(msg.slot);
        await engine?.destroy();
        side.postMessage({ type: "unloaded", slot: msg.slot });
        break;
      }
      case "destroy": {
        for (const { port } of asyncSlots.values()) {
          port.destroy();
        }
        asyncSlots.clear();
        await Promise.all([...engines.values()].map((e) => e.destroy()));
        engines.clear();
        side.postMessage({ type: "destroyed" });
        side.close();
        break;
      }
      default:
        break;
    }
  });
}
