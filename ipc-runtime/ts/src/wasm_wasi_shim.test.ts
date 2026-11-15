import assert from "node:assert/strict";
import { test } from "node:test";
import { WASI_NAMESPACE, createWasiImports } from "./wasm/wasi_shim.js";

/**
 * wasm hands its u32 pointers and sizes to imports as i32, so an address at or above 2 GiB reaches
 * JS as a negative number. Each import is called with one and must write where the module meant.
 */
const HIGH_PAGES = 2 ** 31 / 65536 + 1;
const HIGH = 2 ** 31 + 128;
const P = HIGH | 0;
const SENTINEL = 0xaa;
const IMPORTS = [
  "args_sizes_get",
  "args_get",
  "environ_sizes_get",
  "environ_get",
  "clock_res_get",
  "clock_time_get",
  "random_get",
  "fd_write",
  "fd_fdstat_get",
];

/** A module that only declares the imports, which is all `createWasiImports` reads from it. */
function importingModule(names: string[]): WebAssembly.Module {
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
  const imports = names.flatMap((name) => [...str(WASI_NAMESPACE), ...str(name), 0x00, 0]);
  return new WebAssembly.Module(
    new Uint8Array([
      0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
      ...section(1, [1, 0x60, 0, 0]),
      ...section(2, [...leb(names.length), ...imports]),
    ]),
  );
}

interface High {
  memory: WebAssembly.Memory;
  wasi: ReturnType<typeof createWasiImports>;
  stdout: string[];
  view: () => DataView;
  bytes: (at: number, length: number) => Uint8Array;
}
let high: High | undefined;
let refused: string | undefined;

/** The 2 GiB + 64 KiB memory and a shim over it, made on first use; undefined if refused. */
function highMemory(): High | undefined {
  if (high === undefined && refused === undefined) {
    let memory: WebAssembly.Memory;
    try {
      memory = new WebAssembly.Memory({ initial: HIGH_PAGES, maximum: HIGH_PAGES });
    } catch (err) {
      if (!(err instanceof RangeError)) {
        throw err;
      }
      refused = err.message;
      return undefined;
    }
    const stdout: string[] = [];
    high = {
      memory,
      stdout,
      wasi: createWasiImports(importingModule(IMPORTS), () => memory, {
        args: ["x"],
        env: { A: "1" },
        onStdout: (line) => stdout.push(line),
      }),
      view: () => new DataView(memory.buffer),
      bytes: (at, length) => new Uint8Array(memory.buffer, at, length),
    };
  }
  return high;
}

/** A test that needs memory above 2 GiB, skipped where the engine cannot reserve it. */
function highTest(name: string, body: (h: High) => void): void {
  test(name, (t) => {
    const h = highMemory();
    if (h === undefined) {
      t.skip(`the engine refused a 2 GiB + 64 KiB memory: ${refused}`);
      return;
    }
    h.bytes(HIGH, 256).fill(SENTINEL);
    body(h);
  });
}

highTest(
  "args_sizes_get and environ_sizes_get write their counts above 2 GiB",
  ({ wasi, view }) => {
    assert.equal(wasi.args_sizes_get(P, P + 8), 0);
    assert.deepEqual([view().getUint32(HIGH, true), view().getUint32(HIGH + 8, true)], [1, 2]);
    assert.equal(wasi.environ_sizes_get(P, P + 8), 0);
    assert.deepEqual([view().getUint32(HIGH, true), view().getUint32(HIGH + 8, true)], [1, 4]);
  },
);

highTest(
  "args_get and environ_get write their pointers and strings above 2 GiB",
  ({ wasi, view, bytes }) => {
    assert.equal(wasi.args_get(P, P + 64), 0);
    assert.equal(view().getUint32(HIGH, true), HIGH + 64);
    assert.deepEqual([...bytes(HIGH + 64, 2)], [..."x\0"].map((c) => c.charCodeAt(0)));
    assert.equal(wasi.environ_get(P, P + 64), 0);
    assert.equal(view().getUint32(HIGH, true), HIGH + 64);
    assert.deepEqual([...bytes(HIGH + 64, 4)], [..."A=1\0"].map((c) => c.charCodeAt(0)));
  },
);

highTest("clock_res_get and clock_time_get write above 2 GiB", ({ wasi, view }) => {
  assert.equal(wasi.clock_res_get(0, P), 0);
  assert.equal(view().getBigUint64(HIGH, true), 1000n);
  assert.equal(wasi.clock_time_get(0, 0, P), 0);
  const ms = Number(view().getBigUint64(HIGH, true) / 1_000_000n);
  assert.ok(Math.abs(ms - Date.now()) < 60_000, `clock_time_get wrote ${ms} ms`);
});

highTest("random_get fills a buffer above 2 GiB", ({ wasi, bytes }) => {
  assert.equal(wasi.random_get(P, 32), 0);
  assert.ok(bytes(HIGH, 32).some((b) => b !== SENTINEL));
});

highTest(
  "fd_write reads iovecs and writes its count above 2 GiB",
  ({ wasi, view, bytes, stdout }) => {
    view().setUint32(HIGH, HIGH + 32, true);
    view().setUint32(HIGH + 4, 3, true);
    bytes(HIGH + 32, 3).set(new TextEncoder().encode("hi\n"));
    stdout.length = 0;
    assert.equal(wasi.fd_write(1, P, 1, P + 16), 0);
    assert.deepEqual(stdout, ["hi"]);
    assert.equal(view().getUint32(HIGH + 16, true), 3);
  },
);

highTest(
  "fd_fdstat_get writes its stat above 2 GiB and nothing at the wrong address",
  ({ wasi, memory, bytes }) => {
    // Where `fill` puts a negative start: counted back from the end of memory.
    const wrong = memory.buffer.byteLength + P;
    bytes(wrong, 24).fill(SENTINEL);
    let result: number | Error;
    try {
      result = wasi.fd_fdstat_get(1, P);
    } catch (err) {
      result = err as Error;
    }
    assert.ok(bytes(wrong, 24).every((b) => b === SENTINEL), "bytes at the wrong address changed");
    assert.equal(result, 0);
    assert.equal(bytes(HIGH, 1)[0], 2);
    assert.ok(bytes(HIGH + 1, 23).every((b) => b === 0));
  },
);

test("random_get reads its length as unsigned", () => {
  // -1 means 2^32 - 1 bytes, past the end of this memory: it must throw, not return success.
  const memory = new WebAssembly.Memory({ initial: 1, maximum: 1 });
  const wasi = createWasiImports(importingModule(["random_get"]), () => memory);
  assert.throws(() => wasi.random_get(0, -1), RangeError);
});
