import assert from "node:assert/strict";
import { test } from "node:test";
import { WasmFfiEngine } from "./wasm/backend.js";
import type { WasmFfiBinding, WorkerHandle } from "./wasm/index.node.js";
import { nodePlatform } from "./wasm/platform.node.js";

// A module small enough to write out by hand, so the engine's behaviour can be pinned without a
// real service: it imports a memory and wasi-threads, and exports the FFI contract's three symbols
// plus a `spawn_thread` that forwards to the import.
function buildModule(opts: {
  shared: boolean;
  min: number;
  max: number;
}): WebAssembly.Module {
  const str = (s: string) => [s.length, ...[...s].map((c) => c.charCodeAt(0))];
  const section = (id: number, body: number[]) => [id, body.length, ...body];
  const I32 = 0x7f;

  const types = section(1, [
    3,
    0x60,
    1,
    I32,
    1,
    I32, // (i32) -> i32
    0x60,
    4,
    I32,
    I32,
    I32,
    I32,
    0, // (i32,i32,i32,i32) -> ()
    0x60,
    1,
    I32,
    0, // (i32) -> ()
  ]);
  const imports = section(2, [
    2,
    ...str("env"),
    ...str("memory"),
    0x02,
    opts.shared ? 0x03 : 0x01,
    opts.min,
    opts.max,
    ...str("wasi"),
    ...str("thread-spawn"),
    0x00,
    0,
  ]);
  // Local functions: 1 spawn_thread, 2 ipc_ffi_entry, 3 ipc_ffi_alloc, 4 ipc_ffi_free
  // (index 0 is the imported thread-spawn).
  const functions = section(3, [4, 0, 1, 0, 2]);
  const exports = section(7, [
    4,
    ...str("spawn_thread"),
    0x00,
    1,
    ...str("ipc_ffi_entry"),
    0x00,
    2,
    ...str("ipc_ffi_alloc"),
    0x00,
    3,
    ...str("ipc_ffi_free"),
    0x00,
    4,
  ]);
  // body size, no locals, the code, and the `end` every function body carries.
  const body = (code: number[]) => [code.length + 2, 0, ...code, 0x0b];
  const code = section(10, [
    4,
    ...body([0x20, 0, 0x10, 0]), // spawn_thread(arg) = thread-spawn(arg)
    ...body([]), // ipc_ffi_entry: does nothing
    ...body([0x41, 0x10]), // ipc_ffi_alloc: always the same pointer
    ...body([]), // ipc_ffi_free: does nothing
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
      // The thread never starts: this module's `wasi_thread_start` does not exist, and the test is
      // about when a worker is asked for, not what runs on it.
      return nodePlatform.createWorker(
        new URL("./wasm_engine_stub.worker.js", import.meta.url),
      );
    },
    createMainWorker: (): WorkerHandle => {
      throw new Error("the engine under test runs in-process");
    },
  };
}

test("creates no thread workers until the module spawns one, then one per thread", async () => {
  const binding = countingBinding();
  const engine = await WasmFfiEngine.create(
    {
      module: buildModule({ shared: true, min: 1, max: 4 }),
      threads: 4,
      memory: { initial: 1, maximum: 4 },
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
      module: buildModule({ shared: true, min: 1, max: 4 }),
      threads: 1,
      memory: { initial: 1, maximum: 4 },
    },
    binding,
  );
  const spawn = (arg: number) => engine.host.callExport("spawn_thread", arg);
  assert.equal(spawn(0), -1, "wasi-threads errno, not a tid");
  assert.equal(binding.created(), 0);
  await engine.destroy();
});

test("follows the module's memory declaration rather than the request", async () => {
  // A module built without threads declares an unshared memory; asking for several threads cannot
  // change that, so the engine drops to one thread rather than failing to link.
  const engine = await WasmFfiEngine.create(
    {
      module: buildModule({ shared: false, min: 1, max: 4 }),
      threads: 4,
      memory: { initial: 1, maximum: 4 },
    },
    countingBinding(),
  );
  assert.equal(engine.memory.buffer instanceof SharedArrayBuffer, false);
  assert.equal(engine.threads, 1);
  await engine.destroy();
});

test("finds a maximum the module accepts when the caller asks for more", async () => {
  // The module's declared maximum is not visible from JS, so an over-large request has to be
  // narrowed by probing; 4 pages here against the engine's default ceiling.
  const engine = await WasmFfiEngine.create(
    {
      module: buildModule({ shared: true, min: 1, max: 4 }),
      threads: 2,
      memory: { initial: 1 },
    },
    countingBinding(),
  );
  assert.equal(engine.memory.buffer.byteLength, 64 * 1024);
  await engine.destroy();
});
