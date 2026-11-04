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
const str = (s: string) => [s.length, ...[...s].map((c) => c.charCodeAt(0))];
const section = (id: number, content: number[]) => [id, ...leb(content.length), ...content];
const body = (locals: number[], code: number[]) => {
  const bytes = [...locals, ...code, 0x0b];
  return [...leb(bytes.length), ...bytes];
};
/** `i32.const` of a value below 64 or with bit 6 of its last LEB byte clear, so unsigned LEB reads the same. */
const i32Const = (n: number) => [0x41, ...leb(n)];
const STORE = [0x36, 0x02, 0x00];
const ATOMIC_CMPXCHG = [0xfe, 0x48, 0x02, 0x00];

/** The word the start function claims, as wasm-ld's `__wasm_init_memory` does for a shared memory. */
const START_WORD = 1024;

/**
 * A shared-memory reactor whose start function marks its own instance initialized only if it is
 * the first to claim START_WORD on the memory. Its entry returns 2 on a marked instance, 1 on any
 * other, as 4 bytes.
 */
function buildStartOnceModule(): WebAssembly.Module {
  const [ENTRY, ALLOC, FREE, START] = [0, 1, 2, 3];
  const [BUMP, INITIALIZED] = [0, 1];
  const types = section(1, [
    4,
    ...[0x60, 1, I32, 1, I32], // alloc
    ...[0x60, 4, I32, I32, I32, I32, 0], // entry
    ...[0x60, 1, I32, 0], // free
    ...[0x60, 0, 0], // start
  ]);
  // 4..16 pages: room for the host's 64 KiB request scratch past the bump start.
  const imports = section(2, [1, ...str("env"), ...str("memory"), 0x02, 0x03, ...leb(4), ...leb(16)]);
  const functions = section(3, [4, 1, 0, 2, 3]);
  const globals = section(6, [2, I32, 0x01, ...i32Const(4096), 0x0b, I32, 0x01, ...i32Const(0), 0x0b]);
  const exported = [
    [...str("ipc_ffi_entry"), 0x00, ENTRY],
    [...str("ipc_ffi_alloc"), 0x00, ALLOC],
    [...str("ipc_ffi_free"), 0x00, FREE],
  ];
  const exports = section(7, [exported.length, ...exported.flat()]);
  const start = section(8, [START]);
  const code = section(10, [
    4,
    // entry(in, len, outPtr, outLenPtr): *out = INITIALIZED + 1 for a 4-byte out.
    ...body(
      [1, 1, I32],
      [
        ...[...i32Const(4), 0x10, ALLOC, 0x21, 4],
        ...[0x20, 4, 0x23, INITIALIZED, ...i32Const(1), 0x6a, ...STORE],
        ...[0x20, 2, 0x20, 4, ...STORE],
        ...[0x20, 3, ...i32Const(4), ...STORE],
      ],
    ),
    // alloc(n): return the bump pointer, then advance it.
    ...body([0], [0x23, BUMP, 0x23, BUMP, 0x20, 0, 0x6a, 0x24, BUMP]),
    // free(p): nothing to do.
    ...body([0], []),
    // start(): if cmpxchg(*START_WORD, 0, 1) == 0, INITIALIZED = 1.
    ...body(
      [0],
      [
        ...[...i32Const(START_WORD), ...i32Const(0), ...i32Const(1), ...ATOMIC_CMPXCHG, 0x45],
        ...[0x04, 0x40, ...i32Const(1), 0x24, INITIALIZED, 0x0b],
      ],
    ),
  ]);
  return new WebAssembly.Module(
    new Uint8Array([
      ...[0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00],
      ...types,
      ...imports,
      ...functions,
      ...globals,
      ...exports,
      ...start,
      ...code,
    ]),
  );
}

test("the instance serving calls is the first to run its start function on the memory", async () => {
  for (const worker of [true, false]) {
    const backend = await createWasmFfiBackend({
      module: buildStartOnceModule(),
      threads: 1,
      worker,
      memory: { initial: 4, maximum: 16 },
    });
    try {
      const reply = await backend.call(Uint8Array.of(0));
      assert.equal(new DataView(reply.buffer, reply.byteOffset).getUint32(0, true), 2, `worker: ${worker}`);
    } finally {
      await backend.destroy();
    }
  }
});
