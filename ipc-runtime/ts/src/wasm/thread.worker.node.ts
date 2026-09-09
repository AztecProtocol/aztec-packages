// Default wasi-threads worker for node: one module instance per thread, no module-specific imports.
import { nodeWorkerSide } from "./platform.node.js";
import { runThreadWorker } from "./thread_worker.js";

runThreadWorker(nodeWorkerSide());
