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

/** The word the module's thread writes and its entry waits on. */
const WORD = 1024;
/** What the thread writes. */
const THREAD_VALUE = 42;

/**
 * A threads module whose entry spawns one wasi thread, spins until that thread has stored
 * THREAD_VALUE at WORD, and returns the word: the call returns only if the thread really ran.
 */
function buildSpawningModule(): WebAssembly.Module {
  // Function indices: the imported thread-spawn is 0, then the four defined below.
  const [SPAWN, ENTRY, ALLOC, FREE, THREAD_START] = [0, 1, 2, 3, 4];
  const types = section(1, [
    4,
    ...[0x60, 1, I32, 1, I32], // (i32) -> i32: thread-spawn, alloc
    ...[0x60, 4, I32, I32, I32, I32, 0], // entry
    ...[0x60, 1, I32, 0], // free
    ...[0x60, 2, I32, I32, 0], // wasi_thread_start
  ]);
  const imports = section(2, [
    2,
    // Shared, 4..16 pages: room for the host's 64 KiB request scratch past the bump start.
    ...[...str("env"), ...str("memory"), 0x02, 0x03, ...leb(4), ...leb(16)],
    ...[...str("wasi"), ...str("thread-spawn"), 0x00, 0],
  ]);
  const functions = section(3, [4, 1, 0, 2, 3]);
  // The bump allocator's next free offset, past WORD.
  const globals = section(6, [1, I32, 0x01, ...i32Const(4096), 0x0b]);
  const exports = section(7, [
    4,
    ...[...str("ipc_ffi_entry"), 0x00, ENTRY],
    ...[...str("ipc_ffi_alloc"), 0x00, ALLOC],
    ...[...str("ipc_ffi_free"), 0x00, FREE],
    ...[...str("wasi_thread_start"), 0x00, THREAD_START],
  ]);
  const code = section(10, [
    4,
    // entry(in, len, outPtr, outLenPtr): spawn, wait for the word, return it as 4 bytes.
    ...body(
      [1, 1, I32],
      [
        ...[...i32Const(0), 0x10, SPAWN, 0x1a], // drop(thread-spawn(0))
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
