// A worker that reports it could not instantiate the module.
import { parentPort } from "node:worker_threads";

parentPort!.on("message", (msg) => {
  if (msg?.type === "init") {
    parentPort!.postMessage({
      type: "init-error",
      message: "stub told to fail",
    });
  }
});
