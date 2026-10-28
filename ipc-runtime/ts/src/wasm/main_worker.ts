import { type WasmFfiBinding, WasmFfiEngine } from "./backend.js";
import { awaitHostCallAnswer } from "./host_call.js";
import type { WasmPlatform, WorkerHandle, WorkerSide } from "./platform.js";

/** A service instance the worker hosts: a wasm module's main instance, or an instance of a napi addon. */
export interface HostedInstance {
  call(input: Uint8Array): Uint8Array;
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
 * A module's host calls are answered here: a sibling module is called directly, and anything else
 * is asked of the parent, this thread blocked on the shared channel until it answers.
 */
export function runMainWorker(
  side: WorkerSide,
  platform: WasmPlatform,
  opts: MainWorkerOptions,
): void {
  const engines = new Map<number, HostedInstance>();
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
  ): (target: string, request: Uint8Array) => Uint8Array {
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
        return sibling.call(request);
      }
      side.postMessage({ type: "host-call", slot, target, request }, [
        request.buffer as ArrayBuffer,
      ]);
      const { status, bytes } = awaitHostCallAnswer(channel!);
      if (status !== 0) {
        throw new Error(new TextDecoder().decode(bytes));
      }
      return bytes;
    };
  }

  side.onMessage(async (msg) => {
    switch (msg?.type) {
      case "channel":
        channel = msg.channel;
        break;
      case "load": {
        const slot: number = msg.slot;
        try {
          const hostCall = hostCallFor(slot, msg.hostCall ?? {});
          if (msg.napi !== undefined) {
            if (!opts.loadNapi) {
              throw new Error("napi addons only load in node");
            }
            engines.set(slot, opts.loadNapi(msg.napi, hostCall));
            side.postMessage({ type: "loaded", slot });
            break;
          }
          const o = msg.options ?? {};
          engines.set(
            slot,
            await WasmFfiEngine.create(
              {
                module: msg.module,
                threads: o.threads,
                memory: o.memory,
                env: o.env,
                entry: o.entry,
                logger: (message) =>
                  side.postMessage({ type: "log", slot, message }),
                hostCall,
              },
              binding,
            ),
          );
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
      case "call": {
        try {
          const engine = engines.get(msg.slot);
          if (!engine) {
            throw new Error("wasm module is not loaded");
          }
          const output = engine.call(new Uint8Array(msg.input));
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
        break;
      }
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
