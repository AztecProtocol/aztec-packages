import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import {
  createWasmFfiBackend,
  createWasmFfiBackendSync,
} from "./wasm/node/index.js";

/**
 * A module whose every call is a host call: the entry passes its request to the target "oracle" and
 * returns whatever the host answers (the host's message, when the call fails). Its source:
 *
 *   (module
 *     (import "ipc_runtime" "host_call"
 *       (func $host_call (param i32 i32 i32 i32 i32 i32) (result i32)))
 *     (memory (export "memory") 16)
 *     (global $next (mut i32) (i32.const 4096))
 *     (data (i32.const 16) "oracle")
 *     (func (export "ipc_ffi_alloc") (param $n i32) (result i32)
 *       (global.get $next)
 *       (global.set $next (i32.add (global.get $next) (local.get $n))))
 *     (func (export "ipc_ffi_free") (param i32))
 *     (func (export "ipc_ffi_entry") (param $in i32) (param $len i32) (param $out i32) (param $out_len i32)
 *       (drop (call $host_call (i32.const 16) (i32.const 6)
 *         (local.get $in) (local.get $len) (local.get $out) (local.get $out_len)))))
 */
const HOST_CALL_ECHO = Buffer.from(
  "AGFzbQEAAAABGwRgBn9/f39/fwF/YAF/AX9gAX8AYAR/f39/AAIZAQtpcGNfcnVudGltZQlob3N0X2NhbGwAAAMEAwECAwUDAQAQBgcBfwFBgCALBzkEBm1lbW9yeQIADWlwY19mZmlfYWxsb2MAAQxpcGNfZmZpX2ZyZWUAAg1pcGNfZmZpX2VudHJ5AAMKIgMLACMAIwAgAGokAAsCAAsRAEEQQQYgACABIAIgAxAAGgsLDAEAQRALBm9yYWNsZQ==",
  "base64",
);

const module = () => new WebAssembly.Module(HOST_CALL_ECHO);
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const bytes = (s: string) => new TextEncoder().encode(s);

/** An oracle that answers after a delay, upper-cased, so an answer can only come from the host. */
const slowUpper =
  (delayMs: (request: string) => number) => async (request: Uint8Array) => {
    await sleep(delayMs(text(request)));
    return bytes(text(request).toUpperCase());
  };

for (const worker of [false, true]) {
  const where = worker ? "on a worker" : "on the calling thread";

  test(`a module ${where} waits for an asynchronous host-call answer`, async () => {
    const backend = await createWasmFfiBackend({
      module: module(),
      worker,
      hostCall: { oracle: slowUpper(() => 20) },
    });
    try {
      assert.equal(text(await backend.call(bytes("hello"))), "HELLO");
    } finally {
      await backend.destroy();
    }
  });

  test(`calls into a module ${where} run one at a time, each getting its own answer`, async () => {
    // Earlier requests are answered later, so overlapping calls would get each other's answers.
    const backend = await createWasmFfiBackend({
      module: module(),
      worker,
      hostCall: { oracle: slowUpper((r) => 40 - 10 * Number(r.at(-1))) },
    });
    try {
      const requests = ["call0", "call1", "call2", "call3"];
      const answers = await Promise.all(
        requests.map((r) => backend.call(bytes(r))),
      );
      assert.deepEqual(
        answers.map(text),
        requests.map((r) => r.toUpperCase()),
      );
    } finally {
      await backend.destroy();
    }
  });

  test(`an asynchronous host-call failure ${where} reaches the module as the host's message`, async () => {
    const backend = await createWasmFfiBackend({
      module: module(),
      worker,
      hostCall: {
        oracle: async () => {
          await sleep(5);
          throw new Error("no such note");
        },
      },
    });
    try {
      assert.equal(text(await backend.call(bytes("x"))), "no such note");
    } finally {
      await backend.destroy();
    }
  });
}

test("a synchronous backend takes synchronous answers, and refuses asynchronous ones", async () => {
  const sync = await createWasmFfiBackendSync({
    module: module(),
    hostCall: { oracle: (request) => bytes(text(request).toUpperCase()) },
  });
  assert.equal(text(sync.call(bytes("now"))), "NOW");
  sync.destroy();

  const refusing = await createWasmFfiBackendSync({
    module: module(),
    hostCall: { oracle: slowUpper(() => 1) },
  });
  assert.match(
    text(refusing.call(bytes("later"))),
    /answered asynchronously.*synchronous backend/,
  );
  refusing.destroy();
});
