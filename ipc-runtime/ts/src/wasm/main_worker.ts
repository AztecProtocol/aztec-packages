import { type WasmFfiBinding, WasmFfiEngine } from "./backend.js";
import type { HostCallAnswer } from "./host.js";
import type { WasmPlatform, WorkerHandle, WorkerSide } from "./platform.js";

export interface MainWorkerOptions {
  /** Spawns the thread pool's workers (see `WasmFfiBinding` for why this is a factory). */
  createThreadWorker: () => WorkerHandle;
}

/**
 * Body of the worker hosting modules' main instances (see `WasmWorker`): create an engine per
 * `load`, serve `call` requests, tear down on `unload` and `destroy`. Calls run to completion on
 * this worker's thread; the parent's event loop stays free.
 *
 * A module's host calls are answered here: a sibling module is called directly, and anything else
 * is asked of the parent, the module suspended (JSPI) until the parent answers. Calls run one at a
 * time across the worker's modules: while one is suspended, a call into any of them could re-enter
 * a module mid-call through a sibling.
 */
export function runMainWorker(
  side: WorkerSide,
  platform: WasmPlatform,
  opts: MainWorkerOptions,
): void {
  const engines = new Map<number, WasmFfiEngine>();
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
        return sibling.callEither(request);
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
      const output = await engine.callEither(new Uint8Array(msg.input));
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
                hostCall: hostCallFor(slot, msg.hostCall ?? {}),
                suspending: true,
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
