import { type HostImportsFactory, WasmInstanceHost } from "./host.js";
import type { WorkerSide } from "./platform.js";

export interface ThreadWorkerOptions {
  /** The same module-specific imports the main instance was given, if any. */
  hostImports?: HostImportsFactory;
}

/**
 * Body of a wasi-threads worker: instantiate the module over the shared memory on `init`, then run
 * the module's thread entry on `start`. A thread runs to completion inside `wasi_thread_start`, so
 * this worker serves that one thread and is done; the parent creates one worker per thread the
 * module spawns.
 */
export function runThreadWorker(
  side: WorkerSide,
  opts: ThreadWorkerOptions = {},
): void {
  // `init` and `start` arrive back to back, and instantiation is asynchronous, so `start` waits on
  // this rather than on the message order.
  let instantiated: Promise<WasmInstanceHost> | undefined;
  const log = (message: string) => side.postMessage({ type: "log", message });

  side.onMessage(async (msg) => {
    try {
      switch (msg?.type) {
        case "init":
          instantiated = WasmInstanceHost.instantiate({
            module: msg.module,
            memory: msg.memory,
            env: msg.env,
            entry: msg.entry,
            allocatorExports: msg.allocatorExports,
            hostImports: opts.hostImports,
            threads: 1,
            runInitialize: false,
            // Only the main instance spawns threads; a request from a thread is refused.
            spawnThread: () => -1,
            logger: log,
          });
          await instantiated;
          side.postMessage({ type: "ready" });
          break;
        case "start": {
          if (!instantiated) {
            throw new Error("start before init");
          }
          const host = await instantiated;
          host.callExport("wasi_thread_start", msg.tid, msg.startArg);
          side.postMessage({ type: "thread-exit", tid: msg.tid });
          break;
        }
        default:
          break;
      }
    } catch (e) {
      const message = e instanceof Error ? (e.stack ?? e.message) : String(e);
      if (msg?.type === "init") {
        side.postMessage({ type: "init-error", message });
      } else {
        log(`wasm thread worker: ${message}`);
        side.postMessage({ type: "thread-exit", tid: msg?.tid });
      }
    }
  });
}
