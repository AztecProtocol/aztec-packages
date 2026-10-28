import { type WasmFfiBinding, WasmFfiEngine } from "./backend.js";
import type { HostCallAnswer } from "./host.js";
import { awaitHostCallAnswer } from "./host_call.js";
import type { WasmPlatform, WorkerHandle, WorkerSide } from "./platform.js";

/** A service instance the worker hosts: a wasm module's main instance, or an instance of a napi addon. */
export interface HostedInstance {
  /** A call, which settles later when a wasm module waits on its host (JSPI). */
  call(input: Uint8Array): Uint8Array | Promise<Uint8Array>;
  /** A call that must answer now: one made from a napi instance's host call, on its native stack. */
  callSync(input: Uint8Array): Uint8Array;
  destroy(): Promise<void> | void;
}

export interface MainWorkerOptions {
  /** Spawns the thread pool's workers (see `WasmFfiBinding` for why this is a factory). */
  createThreadWorker: () => WorkerHandle;
  /**
   * Creates an instance of the napi addon at `addonPath` on this worker, its host calls answered by
   * `hostCall`. Only node has addons; elsewhere a napi load fails.
   */
  loadNapi?: (
    addonPath: string,
    hostCall: (target: string, request: Uint8Array) => Uint8Array,
  ) => HostedInstance;
}

/**
 * Body of the worker hosting service instances (see `WasmWorker`): a wasm module's main instance
 * or a napi addon's instance per `load`, serve `call` requests, tear down on `unload` and `destroy`. Calls run to completion on
 * this worker's thread; the parent's event loop stays free.
 *
 * An instance's host calls are answered here: a sibling is called directly, and anything else is
 * asked of the parent. A wasm module waits for the parent's answer suspended (JSPI); a napi instance
 * makes its host calls from a native stack, which can't be suspended, so this thread blocks on the
 * shared channel instead (node always has one), and its siblings must answer it synchronously. Calls
 * run one at a time across the worker's instances: while one is suspended, a call into any of them
 * could re-enter an instance mid-call through a sibling.
 */
export function runMainWorker(
  side: WorkerSide,
  platform: WasmPlatform,
  opts: MainWorkerOptions,
): void {
  const engines = new Map<number, HostedInstance>();
  const answers = new Map<
    number,
    { resolve: (bytes: Uint8Array) => void; reject: (err: Error) => void }
  >();
  let nextHostCall = 0;
  let queue: Promise<unknown> = Promise.resolve();
  let channel: SharedArrayBuffer | undefined;
  const binding: WasmFfiBinding = {
    platform,
    createThreadWorker: opts.createThreadWorker,
    // Unused here: this worker is the main worker.
    createMainWorker: opts.createThreadWorker,
  };

  function hostCallFor(
    slot: number,
    targets: Record<string, { sibling?: number }>,
    blocking: true,
  ): (target: string, request: Uint8Array) => Uint8Array;
  function hostCallFor(
    slot: number,
    targets: Record<string, { sibling?: number }>,
    blocking: false,
  ): HostCallAnswer;
  function hostCallFor(
    slot: number,
    targets: Record<string, { sibling?: number }>,
    blocking: boolean,
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
        return blocking ? sibling.callSync(request) : sibling.call(request);
      }
      if (blocking) {
        side.postMessage(
          { type: "host-call", slot, blocking: true, target, request },
          [request.buffer as ArrayBuffer],
        );
        const { status, bytes } = awaitHostCallAnswer(channel!);
        if (status !== 0) {
          throw new Error(new TextDecoder().decode(bytes));
        }
        return bytes;
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
      const engine = engines.get(msg.slot);
      if (!engine) {
        throw new Error("wasm module is not loaded");
      }
      const output = await engine.call(new Uint8Array(msg.input));
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
      case "channel":
        channel = msg.channel;
        break;
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
          if (msg.napi !== undefined) {
            if (!opts.loadNapi) {
              throw new Error("napi addons only load in node");
            }
            engines.set(
              slot,
              opts.loadNapi(msg.napi, hostCallFor(slot, targets, true)),
            );
            side.postMessage({ type: "loaded", slot });
            break;
          }
          const o = msg.options ?? {};
          const engine = await WasmFfiEngine.create(
              {
                module: msg.module,
                threads: o.threads,
                memory: o.memory,
                env: o.env,
                entry: o.entry,
                logger: (message) =>
                  side.postMessage({ type: "log", slot, message }),
                hostCall: hostCallFor(slot, targets, false),
                suspending: true,
              },
              binding,
            );
          engines.set(slot, {
            call: (input) => engine.callEither(input),
            callSync: (input) => {
              if (engine.suspends) {
                throw new Error(
                  "a wasm module that waits on its host can't answer a napi instance's host call",
                );
              }
              return engine.call(input);
            },
            destroy: () => engine.destroy(),
          });
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
        queue = queue.then(() => call(msg));
        break;
      case "unload": {
        const engine = engines.get(msg.slot);
        engines.delete(msg.slot);
        await engine?.destroy();
        side.postMessage({ type: "unloaded", slot: msg.slot });
        break;
      }
      case "destroy": {
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
