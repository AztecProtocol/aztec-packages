// The addon's native ServiceThread at environment teardown. Run via `yarn test`.

import { test } from "node:test";
import * as assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { findIpcRuntimeNapi } from "./native_loader.js";

const addon = findIpcRuntimeNapi();

test(
  "a worker holding a ServiceThread does not hang process.exit",
  { skip: addon === null && "ipc_runtime_napi.node is not built" },
  () => {
    const script = `
      const { Worker } = require("node:worker_threads");
      const worker = new Worker(
        'const { parentPort } = require("node:worker_threads");' +
          "const { ServiceThread } = require(" + JSON.stringify(${JSON.stringify(addon)}) + ");" +
          "globalThis.thread = new ServiceThread(() => {});" +
          'parentPort.postMessage("ready");',
        { eval: true },
      );
      worker.once("message", () => process.exit(0));`;
    const child = spawnSync(process.execPath, ["-e", script], {
      timeout: 30_000,
      encoding: "utf8",
    });
    assert.equal(child.error, undefined, "the process did not exit");
    assert.equal(child.status, 0, child.stderr);
  },
);
