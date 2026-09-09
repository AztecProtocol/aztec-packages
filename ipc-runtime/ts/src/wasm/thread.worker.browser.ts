// Default wasi-threads worker for browsers: one module instance per thread, no module-specific imports.
import { browserWorkerSide } from "./platform.browser.js";
import { runThreadWorker } from "./thread_worker.js";

runThreadWorker(browserWorkerSide());
