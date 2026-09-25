// Default wasi-threads worker for node: one module instance per thread, no module-specific imports.
import { nodeWorkerSide } from "./platform.js";
import { runThreadWorker } from "../thread_worker.js";

runThreadWorker(nodeWorkerSide());
