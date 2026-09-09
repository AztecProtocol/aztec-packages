// Default main-instance worker for node: hosts the module and its thread pool off the caller's thread.
import { runMainWorker } from "./main_worker.js";
import { nodePlatform, nodeWorkerSide } from "./platform.node.js";

runMainWorker(nodeWorkerSide(), nodePlatform, {
  createThreadWorker: () =>
    nodePlatform.createWorker(
      new URL("./thread.worker.node.js", import.meta.url),
    ),
});
