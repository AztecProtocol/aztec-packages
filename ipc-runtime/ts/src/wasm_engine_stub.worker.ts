// A worker that reports itself instantiated and then does nothing, for tests that observe when the
// engine asks for one.
import { parentPort } from "node:worker_threads";

parentPort!.on("message", (msg) => {
  if (msg?.type === "init") {
    parentPort!.postMessage({ type: "ready" });
  }
});
