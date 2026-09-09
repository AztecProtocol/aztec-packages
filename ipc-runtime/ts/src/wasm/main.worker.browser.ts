// Default main-instance worker for browsers: hosts the module and its thread pool off the page's thread.
import { runMainWorker } from "./main_worker.js";
import {
  browserPlatform,
  browserWorkerHandle,
  browserWorkerSide,
} from "./platform.browser.js";

runMainWorker(browserWorkerSide(), browserPlatform, {
  createThreadWorker: () =>
    browserWorkerHandle(
      new Worker(new URL("./thread.worker.browser.js", import.meta.url), {
        type: "module",
      }),
    ),
});
