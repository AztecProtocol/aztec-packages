import assert from "node:assert/strict";
import { test } from "node:test";
import { WasmFfiEngine } from "./wasm/backend.js";
import type { WasmFfiBinding, WorkerHandle } from "./wasm/node/index.js";
import { nodePlatform } from "./wasm/node/platform.js";

/**
 * A module small enough to write out by hand, so the engine can be pinned without a real service.
 * It imports a memory and wasi-threads, and implements the FFI contract with a bump allocator and
 * an entry that echoes the request back as the response.
 */
function buildModule(opts: {
  shared: boolean;
  min: number;
  max: number;
  /** Define and export a memory instead of importing one, the way a Rust cdylib does. */
  ownMemory?: boolean;
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
  const limits = [opts.shared ? 0x03 : 0x01, ...leb(opts.min), ...leb(opts.max)];
  const imports = section(2, [
    ...(opts.ownMemory
      ? [1]
      : [2, ...str("env"), ...str("memory"), 0x02, ...limits]),
    ...str("wasi"),
    ...str("thread-spawn"),
    0x00,
    0,
  ]);
  const memories = opts.ownMemory ? section(5, [1, ...limits]) : [];
  const functions = section(3, [4, 0, 1, 0, 2]);
  // The bump allocator's next free offset, past the page the entry never touches.
  const globals = section(6, [1, I32, 0x01, 0x41, ...leb(4096), 0x0b]);
  const exports = section(7, [
    opts.ownMemory ? 5 : 4,
    ...(opts.ownMemory ? [...str("memory"), 0x02, 0] : []),
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
      ...memories,
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

test("uses the module's own memory when it exports one instead of importing", async () => {
  // A Rust cdylib defines its own memory, so the one the engine would have made is not the one the
  // module reads and writes: a request echoed through the wrong memory comes back as zeroes. Such
  // a module also cannot be threaded, since every instance would have a memory to itself.
  const engine = await WasmFfiEngine.create(
    { module: buildModule({ shared: false, min: 4, max: 64, ownMemory: true }), threads: 4 },
    countingBinding(),
  );
  assert.equal(engine.threads, 1, "a module owning its memory cannot share it with workers");
  assert.equal(engine.memory, engine.host.instance.exports.memory);
  const request = Uint8Array.from({ length: 5000 }, (_v, i) => (i * 7) & 0xff);
  assert.deepEqual(engine.call(request), request);
  await engine.destroy();
});

/**
 * A module whose entry reports a failure the only way one compiled without exceptions can: it
 * writes the reason to stderr and exits. Everything before the entry is the smallest wrapping the
 * engine will accept, so the test is about what the caller sees, not about the module.
 */
function buildAbortingModule(message: string): WebAssembly.Module {
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
  const section = (id: number, body: number[]) => [id, ...leb(body.length), ...body];
  const body = (locals: number[], code: number[]) => {
    const bytes = [...locals, ...code, 0x0b];
    return [...leb(bytes.length), ...bytes];
  };
  const I32 = 0x7f;
  const WASI = "wasi_snapshot_preview1";
  // Imported functions are numbered first, so the two WASI calls take 0 and 1.
  const [FD_WRITE, PROC_EXIT] = [0, 1];
  // Scratch below the message: the iovec at 0, fd_write's byte count at 8.
  const [IOV, NWRITTEN, MSG] = [0, 8, 16];
  const text = [...new TextEncoder().encode(message)];
  if (MSG + text.length >= 64 || text.length >= 64) {
    throw new Error("the hand-rolled encoder only emits single-byte i32.const operands");
  }

  const types = section(1, [
    4,
    0x60, 4, I32, I32, I32, I32, 1, I32, // fd_write
    0x60, 1, I32, 0, // proc_exit, free
    0x60, 4, I32, I32, I32, I32, 0, // entry
    0x60, 1, I32, 1, I32, // alloc
  ]);
  const imports = section(2, [
    3,
    ...str("env"), ...str("memory"), 0x02, 0x01, ...leb(1), ...leb(4),
    ...str(WASI), ...str("fd_write"), 0x00, 0,
    ...str(WASI), ...str("proc_exit"), 0x00, 1,
  ]);
  const functions = section(3, [3, 2, 3, 1]);
  const globals = section(6, [1, I32, 0x01, 0x41, ...leb(4096), 0x0b]);
  const exports = section(7, [
    3,
    ...str("ipc_ffi_entry"), 0x00, 2,
    ...str("ipc_ffi_alloc"), 0x00, 3,
    ...str("ipc_ffi_free"), 0x00, 4,
  ]);
  const STORE = [0x36, 0x02, 0x00];
  const code = section(10, [
    3,
    // entry: write the message to stderr, then exit non-zero without touching the out slots.
    ...body(
      [0],
      [
        0x41, IOV, 0x41, MSG, ...STORE,
        0x41, IOV + 4, 0x41, text.length, ...STORE,
        0x41, 2, 0x41, IOV, 0x41, 1, 0x41, NWRITTEN, 0x10, FD_WRITE, 0x1a,
        0x41, 1, 0x10, PROC_EXIT,
      ],
    ),
    ...body([0], [0x23, 0, 0x23, 0, 0x20, 0, 0x6a, 0x24, 0]),
    ...body([0], []),
  ]);
  const data = section(11, [1, 0x00, 0x41, MSG, 0x0b, ...leb(text.length), ...text]);

  return new WebAssembly.Module(
    new Uint8Array([
      0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
      ...types, ...imports, ...functions, ...globals, ...exports, ...code, ...data,
    ]),
  );
}

test("a module that reports a failure and exits raises it as an error", async () => {
  const engine = await WasmFfiEngine.create(
    {
      module: buildAbortingModule("abort: not on the curve"),
      threads: 1,
      memory: { initial: 1, maximum: 4 },
    },
    countingBinding(),
  );
  assert.throws(
    () => engine.call(Uint8Array.of(1, 2, 3)),
    (err: Error) => err.message.includes("not on the curve"),
    "the text the module wrote is what the caller sees, not a bare proc_exit",
  );
  await engine.destroy();
});
