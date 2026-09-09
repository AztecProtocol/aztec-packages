import { type HostImportsFactory, WasmInstanceHost } from "./host.js";
import type { WorkerSide } from "./platform.js";

export interface ThreadWorkerOptions {
  /** The same module-specific imports the main instance was given, if any. */
  hostImports?: HostImportsFactory;
}

/**
 * Body of a wasi-threads worker: instantiate the module over the shared memory on `init`, then
 * run the module's thread entry for each `start`. A thread runs to completion inside
 * `wasi_thread_start`, so one worker serves one wasi thread at a time — the pool is sized to the
 * number of threads the module will create.
 */
export function runThreadWorker(
  side: WorkerSide,
  opts: ThreadWorkerOptions = {},
): void {
  let host: WasmInstanceHost | undefined;
  const log = (message: string) => side.postMessage({ type: "log", message });
  side.onMessage(async (msg) => {
    try {
      switch (msg?.type) {
        case "init":
          host = await WasmInstanceHost.instantiate({
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
          side.postMessage({ type: "ready" });
          break;
        case "start":
          host!.callExport("wasi_thread_start", msg.tid, msg.startArg);
          side.postMessage({ type: "thread-exit", tid: msg.tid });
          break;
        default:
          break;
      }
    } catch (e) {
      const message = e instanceof Error ? (e.stack ?? e.message) : String(e);
      if (msg?.type === "init") {
        side.postMessage({ type: "init-error", message });
      } else {
        log(`wasm thread worker: ${message}`);
      }
    }
  });
}
