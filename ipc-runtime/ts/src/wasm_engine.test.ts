import assert from "node:assert/strict";
import { test } from "node:test";
import { WasmFfiEngine } from "./wasm/backend.js";
import type { WasmFfiBinding, WorkerHandle } from "./wasm/index.node.js";
import { nodePlatform } from "./wasm/platform.node.js";

/**
 * A module small enough to write out by hand, so the engine can be pinned without a real service.
 * It imports a memory and wasi-threads, and implements the FFI contract with a bump allocator and
 * an entry that echoes the request back as the response.
 */
function buildModule(opts: {
  shared: boolean;
  min: number;
  max: number;
}): WebAssembly.Module {
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
  const section = (id: number, body: number[]) => [
    id,
    ...leb(body.length),
    ...body,
  ];
  const I32 = 0x7f;
  // Function indices: 0 is the imported thread-spawn, then the four defined below.
  const [SPAWN, ENTRY, ALLOC, FREE] = [1, 2, 3, 4];

  const types = section(1, [
    3,
    0x60,
    1,
    I32,
    1,
    I32, // (i32) -> i32          alloc, spawn_thread
    0x60,
    4,
    I32,
    I32,
    I32,
    I32,
    0, // (i32 x4) -> ()   entry
    0x60,
    1,
    I32,
    0, // (i32) -> ()                     free
  ]);
  const imports = section(2, [
    2,
    ...str("env"),
    ...str("memory"),
    0x02,
    opts.shared ? 0x03 : 0x01,
    ...leb(opts.min),
    ...leb(opts.max),
    ...str("wasi"),
    ...str("thread-spawn"),
    0x00,
    0,
  ]);
  const functions = section(3, [4, 0, 1, 0, 2]);
  // The bump allocator's next free offset, past the page the entry never touches.
  const globals = section(6, [1, I32, 0x01, 0x41, ...leb(4096), 0x0b]);
  const exports = section(7, [
    4,
    ...str("spawn_thread"),
    0x00,
    SPAWN,
    ...str("ipc_ffi_entry"),
    0x00,
    ENTRY,
    ...str("ipc_ffi_alloc"),
    0x00,
    ALLOC,
    ...str("ipc_ffi_free"),
    0x00,
    FREE,
  ]);
  const body = (locals: number[], code: number[]) => {
    const bytes = [...locals, ...code, 0x0b];
    return [...leb(bytes.length), ...bytes];
  };
  const STORE = [0x36, 0x02, 0x00]; // i32.store, natural alignment, no offset
  const code = section(10, [
    4,
    // spawn_thread(arg) = thread-spawn(arg)
    ...body([0], [0x20, 0, 0x10, 0]),
    // entry(in, len, outPtr, outLenPtr): out = alloc(len); *outPtr = out; *outLenPtr = len;
    // copy the request into it, so a caller sees its own bytes come back.
    ...body(
      [1, 1, I32],
      [
        0x20,
        1,
        0x10,
        ALLOC,
        0x21,
        4, // local 4 = alloc(len)
        0x20,
        2,
        0x20,
        4,
        ...STORE,
        0x20,
        3,
        0x20,
        1,
        ...STORE,
        0x20,
        4,
        0x20,
        0,
        0x20,
        1,
        0xfc,
        0x0a,
        0x00,
        0x00, // memory.copy(out, in, len)
      ],
    ),
    // alloc(n): return the bump pointer, then advance it.
    ...body([0], [0x23, 0, 0x23, 0, 0x20, 0, 0x6a, 0x24, 0]),
    // free(p): nothing to do.
    ...body([0], []),
  ]);

  return new WebAssembly.Module(
    new Uint8Array([
      0x00,
      0x61,
      0x73,
      0x6d,
      0x01,
      0x00,
      0x00,
      0x00,
      ...types,
      ...imports,
      ...functions,
      ...globals,
      ...exports,
      ...code,
    ]),
  );
}

/** A binding that counts the workers it is asked for, so on-demand creation is observable. */
function countingBinding(): WasmFfiBinding & { created: () => number } {
  let created = 0;
  return {
    platform: nodePlatform,
    created: () => created,
    createThreadWorker: () => {
      created++;
      // The thread never starts: this module has no `wasi_thread_start`, and the test is about
      // when a worker is asked for, not what runs on it.
      return nodePlatform.createWorker(
        new URL("./wasm_engine_stub.worker.js", import.meta.url),
      );
    },
    createMainWorker: (): WorkerHandle => {
      throw new Error("the engine under test runs in-process");
    },
  };
}

const threadedModule = () => buildModule({ shared: true, min: 4, max: 64 });

test("creates no thread workers until the module spawns one, then one per thread", async () => {
  const binding = countingBinding();
  const engine = await WasmFfiEngine.create(
    {
      module: threadedModule(),
      threads: 4,
      memory: { initial: 4, maximum: 64 },
    },
    binding,
  );
  assert.equal(engine.threads, 4);
  assert.equal(binding.created(), 0, "nothing spawned before the module asks");

  const spawn = (arg: number) => engine.host.callExport("spawn_thread", arg);
  assert.equal(spawn(0), 2, "first tid");
  assert.equal(binding.created(), 1);
  assert.equal(spawn(0), 3, "tids keep counting up");
  assert.equal(spawn(0), 4);
  assert.equal(binding.created(), 3, "one worker per spawned thread, no pool");

  await engine.destroy();
});

test("refuses to spawn when the engine runs single-threaded", async () => {
  const binding = countingBinding();
  const engine = await WasmFfiEngine.create(
    {
      module: threadedModule(),
      threads: 1,
      memory: { initial: 4, maximum: 64 },
    },
    binding,
  );
  assert.equal(
    engine.host.callExport("spawn_thread", 0),
    -1,
    "wasi-threads errno, not a tid",
  );
  assert.equal(binding.created(), 0);
  await engine.destroy();
});

test("follows the module's memory declaration rather than the request", async () => {
  // A module built without threads declares an unshared memory; asking for several threads cannot
  // change that, so the engine drops to one thread rather than failing to link.
  const engine = await WasmFfiEngine.create(
    {
      module: buildModule({ shared: false, min: 4, max: 64 }),
      threads: 4,
      memory: { initial: 4, maximum: 64 },
    },
    countingBinding(),
  );
  assert.equal(engine.memory.buffer instanceof SharedArrayBuffer, false);
  assert.equal(engine.threads, 1);
  await engine.destroy();
});

test("finds a maximum the module accepts when the caller asks for more", async () => {
  // The module's declared maximum is not visible from JS, so an over-large request has to be
  // narrowed by probing; 64 pages here against the engine's default ceiling.
  const engine = await WasmFfiEngine.create(
    { module: threadedModule(), threads: 2, memory: { initial: 4 } },
    countingBinding(),
  );
  assert.equal(engine.memory.buffer.byteLength, 4 * 64 * 1024);
  await engine.destroy();
});

test("round-trips requests, growing the reused request buffer to fit", async () => {
  const engine = await WasmFfiEngine.create(
    {
      module: threadedModule(),
      threads: 1,
      memory: { initial: 64, maximum: 64 },
    },
    countingBinding(),
  );
  // Sizes that cross the initial scratch and shrink back again: a stale pointer or a buffer that
  // failed to grow would echo the wrong bytes.
  for (const size of [1, 64, 100_000, 8, 250_000, 32]) {
    const request = Uint8Array.from(
      { length: size },
      (_v, i) => (i * 31 + size) & 0xff,
    );
    assert.deepEqual(engine.call(request), request, `echo of ${size} bytes`);
  }
  await engine.destroy();
});
