import assert from "node:assert/strict";
import { test } from "node:test";
import { createWasmFfiBackend } from "./wasm/node/index.js";
import type { WorkerHandle } from "./wasm/platform.js";

const I32 = 0x7f;
const leb = (n: number) => {
  const out = [];
  do {
    const byte = n & 0x7f;
    n >>>= 7;
    out.push(n === 0 ? byte : byte | 0x80);
  } while (n !== 0);
  return out;
};
const sleb = (n: number) => {
  const out = [];
  for (;;) {
    const byte = n & 0x7f;
    n >>= 7;
    if ((n === 0 && (byte & 0x40) === 0) || (n === -1 && (byte & 0x40) !== 0)) {
      out.push(byte);
      return out;
    }
    out.push(byte | 0x80);
  }
};
const str = (s: string) => [s.length, ...[...s].map((c) => c.charCodeAt(0))];
const section = (id: number, content: number[]) => [id, ...leb(content.length), ...content];
const body = (locals: number[], code: number[]) => {
  const bytes = [...locals, ...code, 0x0b];
  return [...leb(bytes.length), ...bytes];
};
const i32Const = (n: number) => [0x41, ...sleb(n)];
const STORE = [0x36, 0x02, 0x00];
const ATOMIC_LOAD = [0xfe, 0x10, 0x02, 0x00];
const ATOMIC_STORE = [0xfe, 0x17, 0x02, 0x00];

/** The word the module's thread writes and its call waits on. */
const WORD = 1024;
/** What the thread writes. */
const THREAD_VALUE = 42;

/**
 * A threads module whose call spawns one wasi thread, spins until that thread has stored
 * THREAD_VALUE at WORD, and returns the word: the call returns only if the thread really ran.
 */
function buildSpawningModule(): WebAssembly.Module {
  // Function indices: the imported thread-spawn is 0, then the five defined below.
  const [SPAWN, CALL, ALLOC, FREE, THREAD_START, CREATE] = [0, 1, 2, 3, 4, 5];
  const types = section(1, [
    5,
    ...[0x60, 1, I32, 1, I32], // (i32) -> i32: thread-spawn, alloc
    ...[0x60, 5, I32, I32, I32, I32, I32, 0], // call
    ...[0x60, 1, I32, 0], // free
    ...[0x60, 2, I32, I32, 0], // wasi_thread_start
    ...[0x60, 0, 1, I32], // create
  ]);
  const imports = section(2, [
    2,
    // Shared, 4..16 pages: room for the host's 64 KiB request scratch past the bump start.
    ...[...str("env"), ...str("memory"), 0x02, 0x03, ...leb(4), ...leb(16)],
    ...[...str("wasi"), ...str("thread-spawn"), 0x00, 0],
  ]);
  const functions = section(3, [5, 1, 0, 2, 3, 4]);
  // The bump allocator's next free offset, past WORD.
  const globals = section(6, [1, I32, 0x01, ...i32Const(4096), 0x0b]);
  const exports = section(7, [
    5,
    ...[...str("ipc_ffi_create"), 0x00, CREATE],
    ...[...str("ipc_ffi_call"), 0x00, CALL],
    ...[...str("ipc_ffi_alloc"), 0x00, ALLOC],
    ...[...str("ipc_ffi_free"), 0x00, FREE],
    ...[...str("wasi_thread_start"), 0x00, THREAD_START],
  ]);
  const code = section(10, [
    5,
    // call(instance, in, len, outPtr, outLenPtr): spawn, wait for the word, return it as 4 bytes.
    ...body(
      [1, 1, I32],
      [
        ...[...i32Const(0), 0x10, SPAWN, 0x1a], // drop(thread-spawn(0))
        ...[0x03, 0x40, ...i32Const(WORD), ...ATOMIC_LOAD, 0x45, 0x0d, 0, 0x0b], // loop while *WORD == 0
        ...[...i32Const(4), 0x10, ALLOC, 0x21, 5], // out = alloc(4)
        ...[0x20, 5, ...i32Const(WORD), ...ATOMIC_LOAD, ...STORE], // *out = *WORD
        ...[0x20, 3, 0x20, 5, ...STORE], // *outPtr = out
        ...[0x20, 4, ...i32Const(4), ...STORE], // *outLenPtr = 4
      ],
    ),
    // alloc(n): return the bump pointer, then advance it.
    ...body([0], [0x23, 0, 0x23, 0, 0x20, 0, 0x6a, 0x24, 0]),
    // free(p): nothing to do.
    ...body([0], []),
    // wasi_thread_start(tid, arg): *WORD = THREAD_VALUE.
    ...body([0], [...i32Const(WORD), ...i32Const(THREAD_VALUE), ...ATOMIC_STORE]),
    // create(): the one instance there is, any non-null handle.
    ...body([0], [...i32Const(1)]),
  ]);
  return new WebAssembly.Module(
    new Uint8Array([
      ...[0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00],
      ...types,
      ...imports,
      ...functions,
      ...globals,
      ...exports,
      ...code,
    ]),
  );
}

/** Turns a call that never returns into a failure carrying what the backend logged. */
async function within<T>(promise: Promise<T>, ms: number, log: string[]): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`no reply within ${ms} ms; backend log:\n${log.join("\n")}`)),
      ms,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

test("a worker-mode backend starts the threads its module spawns (node)", async () => {
  const log: string[] = [];
  const backend = await createWasmFfiBackend({
    module: buildSpawningModule(),
    moduleMemory: { initial: 4, maximum: 16, shared: true },
    threads: 2,
    memory: { initial: 4, maximum: 16 },
    logger: (message) => log.push(message),
  });
  try {
    const reply = await within(backend.call(Uint8Array.of(0)), 10_000, log);
    assert.equal(new DataView(reply.buffer, reply.byteOffset).getUint32(0, true), THREAD_VALUE);
  } finally {
    await backend.destroy();
  }
});

test("a backend terminates a main worker that fails to start", async () => {
  const handlers: ((message: unknown) => void)[] = [];
  let terminated = false;
  const worker: WorkerHandle = {
    postMessage: (message: any) => {
      const reply =
        message?.type === "load"
          ? { type: "load-error", slot: message.slot, message: "no entry" }
          : message?.type === "destroy"
            ? { type: "destroyed" }
            : undefined;
      if (reply) {
        queueMicrotask(() => handlers.forEach((h) => h(reply)));
      }
    },
    onMessage: (handler) => handlers.push(handler),
    onError: () => {},
    terminate: async () => {
      terminated = true;
    },
    unref: () => {},
  };
  const module = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 1, 0, 0, 0]);
  await assert.rejects(createWasmFfiBackend({ module, createMainWorker: () => worker }), /no entry/);
  assert.equal(terminated, true);
});

/**
 * A threads module that records whether its instance initialized the shared memory. Its start
 * function claims a flag at address 0, as wasm-ld's `__wasm_init_memory` does to initialize a
 * shared memory once: the first instance on the memory sets up its data and the main thread's TLS,
 * and later instances (the module's threads) skip that. A call returns 1 if this instance won.
 *
 *   (module
 *     (import "env" "memory" (memory 4 16 shared))
 *     (global $initialized_here (mut i32) (i32.const 0))
 *     (global $next (mut i32) (i32.const 4096))
 *     (func $start
 *       (if (i32.eqz (i32.atomic.rmw.cmpxchg (i32.const 0) (i32.const 0) (i32.const 1)))
 *         (then (global.set $initialized_here (i32.const 1)))))
 *     (start $start)
 *     (func $alloc (export "ipc_ffi_alloc") (param $n i32) (result i32)
 *       (global.get $next)
 *       (global.set $next (i32.add (global.get $next) (i32.and (i32.add (local.get $n) (i32.const 15)) (i32.const -16)))))
 *     (func (export "ipc_ffi_free") (param i32))
 *     (func (export "ipc_ffi_create") (result i32) (i32.const 1))
 *     (func (export "ipc_ffi_call") (param $instance i32) (param $in i32) (param $len i32) (param $out i32) (param $out_len i32)
 *       (local $reply i32)
 *       (local.set $reply (call $alloc (i32.const 4)))
 *       (i32.store (local.get $reply) (global.get $initialized_here))
 *       (i32.store (local.get $out) (local.get $reply))
 *       (i32.store (local.get $out_len) (i32.const 4))))
 */
const FIRST_INSTANCE = Buffer.from(
  "AGFzbQEAAAABGQVgAABgAX8Bf2ABfwBgAAF/YAV/f39/fwACEAEDZW52Bm1lbW9yeQIDBBADBgUAAQIDBAYMAn8BQQALfwFBgCALB0AEDWlwY19mZmlfYWxsb2MAAQxpcGNfZmZpX2ZyZWUAAg5pcGNfZmZpX2NyZWF0ZQADDGlwY19mZmlfY2FsbAAECAEAClAFFABBAEEAQQH+SAIARQRAQQEkAAsLEQAjASMBIABBD2pBcHFqJAELAgALBABBAQsfAQF/QQQQASEFIAUjADYCACADIAU2AgAgBEEENgIACw==",
  "base64",
);

test("the main instance is the one that initializes its shared memory", async () => {
  const backend = await createWasmFfiBackend({
    module: new WebAssembly.Module(FIRST_INSTANCE),
    moduleMemory: { initial: 4, maximum: 16, shared: true },
    threads: 2,
    memory: { initial: 4, maximum: 16 },
  });
  try {
    const reply = await backend.call(Uint8Array.of(0));
    assert.equal(
      new DataView(reply.buffer, reply.byteOffset).getUint32(0, true),
      1,
      "another instance initialized the memory first, so the main thread's TLS is never set up",
    );
  } finally {
    await backend.destroy();
  }
});
