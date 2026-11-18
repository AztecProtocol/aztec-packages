import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import {
  createWasmFfiBackend,
  createWasmFfiBackendSync,
} from "./wasm/node/index.js";

/**
 * A module whose every call is a host call: it passes its request to the target "oracle" and
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
 *     (func (export "ipc_ffi_create") (result i32) (i32.const 1))
 *     (func (export "ipc_ffi_call") (param $instance i32) (param $in i32) (param $len i32) (param $out i32) (param $out_len i32)
 *       (drop (call $host_call (i32.const 16) (i32.const 6)
 *         (local.get $in) (local.get $len) (local.get $out) (local.get $out_len)))))
 */
const HOST_CALL_ECHO = Buffer.from(
  "AGFzbQEAAAABIAVgBn9/f39/fwF/YAF/AX9gAX8AYAABf2AFf39/f38AAhkBC2lwY19ydW50aW1lCWhvc3RfY2FsbAAAAwUEAQIDBAUDAQAQBgcBfwFBgCALB0kFBm1lbW9yeQIADWlwY19mZmlfYWxsb2MAAQxpcGNfZmZpX2ZyZWUAAg5pcGNfZmZpX2NyZWF0ZQADDGlwY19mZmlfY2FsbAAECicECwAjACMAIABqJAALAgALBABBAQsRAEEQQQYgASACIAMgBBAAGgsLDAEAQRALBm9yYWNsZQ==",
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

test("a module waits for an asynchronous host-call answer", async () => {
  const backend = await createWasmFfiBackend({
    module: module(),
    hostCall: { oracle: slowUpper(() => 20) },
  });
  try {
    assert.equal(text(await backend.call(bytes("hello"))), "HELLO");
  } finally {
    await backend.destroy();
  }
});

test("calls into a module run one at a time, each getting its own answer", async () => {
  // Earlier requests are answered later, so overlapping calls would get each other's answers.
  const backend = await createWasmFfiBackend({
    module: module(),
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

test("an asynchronous host-call failure reaches the module as the host's message", async () => {
  const backend = await createWasmFfiBackend({
    module: module(),
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

/**
 * A module that answers a call with its request, and whose `ipc_ffi_destroy` tells the host target
 * "ended" which instance it is ending (create() makes instance 7). Its source:
 *
 *   (module
 *     (import "ipc_runtime" "host_call"
 *       (func $host_call (param i32 i32 i32 i32 i32 i32) (result i32)))
 *     (memory (export "memory") 16)
 *     (global $next (mut i32) (i32.const 4096))
 *     (data (i32.const 16) "ended")
 *     (func (export "ipc_ffi_alloc") (param $n i32) (result i32)
 *       (global.get $next)
 *       (global.set $next (i32.add (global.get $next) (local.get $n))))
 *     (func (export "ipc_ffi_free") (param i32))
 *     (func (export "ipc_ffi_create") (result i32) (i32.const 7))
 *     (func (export "ipc_ffi_destroy") (param $instance i32)
 *       (i32.store (i32.const 0) (local.get $instance))
 *       (drop (call $host_call (i32.const 16) (i32.const 5) (i32.const 0) (i32.const 4) (i32.const 32) (i32.const 36))))
 *     (func (export "ipc_ffi_call") (param $instance i32) (param $in i32) (param $len i32) (param $out i32) (param $out_len i32)
 *       (i32.store (local.get $out) (local.get $in))
 *       (i32.store (local.get $out_len) (local.get $len))))
 */
const REPORTS_ITS_END = Buffer.from(
  "AGFzbQEAAAABIAVgBn9/f39/fwF/YAF/AX9gAX8AYAABf2AFf39/f38AAhkBC2lwY19ydW50aW1lCWhvc3RfY2FsbAAAAwYFAQIDAgQFAwEAEAYHAX8BQYAgCwdbBgZtZW1vcnkCAA1pcGNfZmZpX2FsbG9jAAEMaXBjX2ZmaV9mcmVlAAIOaXBjX2ZmaV9jcmVhdGUAAw9pcGNfZmZpX2Rlc3Ryb3kABAxpcGNfZmZpX2NhbGwABQo/BQsAIwAjACAAaiQACwIACwQAQQcLGABBACAANgIAQRBBBUEAQQRBIEEkEAAaCxAAIAMgATYCACAEIAI2AgALCwsBAEEQCwVlbmRlZA==",
  "base64",
);

test("destroying a backend ends the service instance its calls made, and makes none", async () => {
  const ended: number[] = [];
  const hostCall = {
    ended: (request: Uint8Array) => {
      ended.push(new DataView(request.buffer, request.byteOffset).getUint32(0, true));
      return new Uint8Array();
    },
  };
  const used = await createWasmFfiBackendSync({ module: new WebAssembly.Module(REPORTS_ITS_END), hostCall });
  assert.equal(text(used.call(bytes("hi"))), "hi");
  used.destroy();
  assert.deepEqual(ended, [7]);

  const unused = await createWasmFfiBackendSync({ module: new WebAssembly.Module(REPORTS_ITS_END), hostCall });
  unused.destroy();
  assert.deepEqual(ended, [7], "a backend that was never called has no instance to end");
});
