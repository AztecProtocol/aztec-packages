import assert from "node:assert/strict";
import { test } from "node:test";
import { createWasmFfiBackend } from "./wasm/node/index.js";

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

/** The word the module's entry waits on: its thread or the host sets it. */
const WORD = 1024;
/** What the module's thread writes. */
const THREAD_VALUE = 42;

/**
 * A module whose entry spins until WORD is nonzero and returns the word as 4 bytes, so a call
 * returns only once something else has set it.
 * - `spawn`: the entry first spawns one wasi thread, which stores THREAD_VALUE.
 * - `exportFlag`: exports `ipc_ffi_interrupt_flag`, naming WORD as the interrupt flag.
 * - `shared`: declares its memory shared (the default), as a threads build does.
 */
function buildWaitingModule(
  opts: { spawn?: boolean; exportFlag?: boolean; shared?: boolean } = {},
): WebAssembly.Module {
  // Function indices: the imported thread-spawn is 0, then the five defined below.
  const [SPAWN, ENTRY, ALLOC, FREE, THREAD_START, FLAG] = [0, 1, 2, 3, 4, 5];
  const types = section(1, [
    5,
    ...[0x60, 1, I32, 1, I32], // (i32) -> i32: thread-spawn, alloc
    ...[0x60, 4, I32, I32, I32, I32, 0], // entry
    ...[0x60, 1, I32, 0], // free
    ...[0x60, 2, I32, I32, 0], // wasi_thread_start
    ...[0x60, 0, 1, I32], // ipc_ffi_interrupt_flag
  ]);
  const imports = section(2, [
    2,
    // 4..16 pages: room for the host's 64 KiB request scratch past the bump start.
    ...[...str("env"), ...str("memory"), 0x02, opts.shared === false ? 0x01 : 0x03, ...leb(4), ...leb(16)],
    ...[...str("wasi"), ...str("thread-spawn"), 0x00, 0],
  ]);
  const functions = section(3, [5, 1, 0, 2, 3, 4]);
  // The bump allocator's next free offset, past WORD.
  const globals = section(6, [1, I32, 0x01, ...i32Const(4096), 0x0b]);
  const exported = [
    [...str("ipc_ffi_entry"), 0x00, ENTRY],
    [...str("ipc_ffi_alloc"), 0x00, ALLOC],
    [...str("ipc_ffi_free"), 0x00, FREE],
    [...str("wasi_thread_start"), 0x00, THREAD_START],
    ...(opts.exportFlag ? [[...str("ipc_ffi_interrupt_flag"), 0x00, FLAG]] : []),
  ];
  const exports = section(7, [exported.length, ...exported.flat()]);
  const code = section(10, [
    5,
    // entry(in, len, outPtr, outLenPtr): wait for the word, return it as 4 bytes.
    ...body(
      [1, 1, I32],
      [
        ...(opts.spawn ? [...i32Const(0), 0x10, SPAWN, 0x1a] : []), // drop(thread-spawn(0))
        ...[0x03, 0x40, ...i32Const(WORD), ...ATOMIC_LOAD, 0x45, 0x0d, 0, 0x0b], // loop while *WORD == 0
        ...[...i32Const(4), 0x10, ALLOC, 0x21, 4], // out = alloc(4)
        ...[0x20, 4, ...i32Const(WORD), ...ATOMIC_LOAD, ...STORE], // *out = *WORD
        ...[0x20, 2, 0x20, 4, ...STORE], // *outPtr = out
        ...[0x20, 3, ...i32Const(4), ...STORE], // *outLenPtr = 4
      ],
    ),
    // alloc(n): return the bump pointer, then advance it.
    ...body([0], [0x23, 0, 0x23, 0, 0x20, 0, 0x6a, 0x24, 0]),
    // free(p): nothing to do.
    ...body([0], []),
    // wasi_thread_start(tid, arg): *WORD = THREAD_VALUE.
    ...body([0], [...i32Const(WORD), ...i32Const(THREAD_VALUE), ...ATOMIC_STORE]),
    // ipc_ffi_interrupt_flag(): WORD.
    ...body([0], i32Const(WORD)),
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

const replyWord = (reply: Uint8Array) => new DataView(reply.buffer, reply.byteOffset).getUint32(0, true);

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
    module: buildWaitingModule({ spawn: true }),
    threads: 2,
    memory: { initial: 4, maximum: 16 },
    logger: (message) => log.push(message),
  });
  try {
    const reply = await within(backend.call(Uint8Array.of(0)), 10_000, log);
    assert.equal(replyWord(reply), THREAD_VALUE);
  } finally {
    await backend.destroy();
  }
});

test("interrupt() sets the flag of a module running a call on its worker", async () => {
  const log: string[] = [];
  const backend = await createWasmFfiBackend({
    module: buildWaitingModule({ exportFlag: true }),
    threads: 1,
    memory: { initial: 4, maximum: 16 },
    logger: (message) => log.push(message),
  });
  try {
    assert.equal(backend.interruptible, true);
    const reply = backend.call(Uint8Array.of(0));
    // Gives the worker time to enter the call; the call returns only once the flag is set.
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(backend.interrupt(), true);
    assert.equal(replyWord(await within(reply, 10_000, log)), 1);
  } finally {
    await backend.destroy();
  }
  assert.equal(backend.interruptible, false, "destroy drops the flag");
  assert.equal(backend.interrupt(), false);
});

test("a call issued after destroy() rejects (worker mode)", async () => {
  const log: string[] = [];
  const backend = await createWasmFfiBackend({
    module: buildWaitingModule(),
    threads: 1,
    memory: { initial: 4, maximum: 16 },
    logger: (message) => log.push(message),
  });
  await backend.destroy();
  await assert.rejects(within(backend.call(Uint8Array.of(0)), 2_000, log), /wasm backend destroyed/);
});

test("a backend is not interruptible without the export, a shared memory, or a worker", async () => {
  const cases = {
    "no flag export": { module: buildWaitingModule() },
    "unshared memory": { module: buildWaitingModule({ exportFlag: true, shared: false }) },
    "direct mode": { module: buildWaitingModule({ exportFlag: true }), worker: false },
  };
  for (const [name, opts] of Object.entries(cases)) {
    const backend = await createWasmFfiBackend({ threads: 1, memory: { initial: 4, maximum: 16 }, ...opts });
    try {
      assert.equal(backend.interruptible, false, name);
      assert.equal(backend.interrupt(), false, name);
    } finally {
      await backend.destroy();
    }
  }
});
