import {
  type HostCallTargets,
  SERVICE_BACKEND,
} from "@aztec-foundation/ipc-runtime";
import { readFileSync } from "node:fs";
import { EchoService, EchoServiceSync } from "./index.js";

const args = process.argv.slice(2);
const transportArg = args[args.indexOf("--transport") + 1] ?? "uds";
if (!["uds", "shm", "napi", "wasm"].includes(transportArg)) {
  throw new Error(`Unknown --transport '${transportArg}'`);
}

function testHash(base: number): Uint8Array {
  return Uint8Array.from({ length: 32 }, (_v, i) => base + i);
}

function assertEqual(actual: unknown, expected: unknown, label: string) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${label}: expected ${expectedJson}, got ${actualJson}`);
  }
}

function assertBytes(actual: Uint8Array, expected: Uint8Array, label: string) {
  assertEqual(
    Buffer.from(actual).toString("hex"),
    Buffer.from(expected).toString("hex"),
    label,
  );
}

/**
 * Relay calls out to the host's "peer" before it answers; binding "peer" back to the same service
 * makes each hop another call into it while the hops before it wait on their answers. The service
 * only gets through that if it keeps taking calls while its own host calls are out.
 */
async function checkRelay(
  label: string,
  make: (hostCall: HostCallTargets) => Promise<EchoService>,
) {
  let service: EchoService | undefined;
  let waiting = 0;
  let mostWaiting = 0;
  service = await make({
    peer: async (request: Uint8Array) => {
      mostWaiting = Math.max(mostWaiting, ++waiting);
      try {
        return await service![SERVICE_BACKEND].call(request);
      } finally {
        waiting--;
      }
    },
  });
  try {
    const answer = await service.relay({ data: Uint8Array.from([9]), hops: 5 });
    assertBytes(answer.data, Uint8Array.from([9, 5, 4, 3, 2, 1]), `${label} relay`);
    assertEqual(mostWaiting, 5, `${label} relay: hops waiting at once`);

    // Two relays at once, their hops interleaving on the one service.
    const [a, b] = await Promise.all([
      service.relay({ data: Uint8Array.from([1]), hops: 3 }),
      service.relay({ data: Uint8Array.from([2]), hops: 2 }),
    ]);
    assertBytes(a.data, Uint8Array.from([1, 3, 2, 1]), `${label} relay a`);
    assertBytes(b.data, Uint8Array.from([2, 2, 1]), `${label} relay b`);
  } finally {
    await service.destroy();
  }

  // A host call the host cannot answer fails the relay with the host's message.
  const unbound = await make({});
  try {
    await unbound
      .relay({ data: Uint8Array.from([1]), hops: 1 })
      .then(() => {
        throw new Error(`${label}: a relay with no peer should fail`);
      })
      .catch((e: Error) => {
        if (!e.message.includes('no host-call target "peer"')) throw e;
      });
  } finally {
    await unbound.destroy();
  }
}

// The napi transport loads the service's shared library in-process, its instance on a native
// thread of its own.
if (transportArg === "napi") {
  const napiService = await EchoService.napi();
  try {
    const data = Uint8Array.from([0xde, 0xad, 0xbe, 0xef]);
    assertBytes((await napiService.bytes({ data })).data, data, "napi.bytes");
  } finally {
    await napiService.destroy();
  }
  await checkRelay("napi", (hostCall) => EchoService.napi({ hostCall }));
  console.error("echo ts package: napi OK");
  process.exit(0);
}

// The wasm transport runs the service's own wasi reactor in-process, with no binary at all: the
// asynchronous form on a worker of its own, and the synchronous one on the calling thread.
if (transportArg === "wasm") {
  const wasmService = await EchoService.create({ backend: "wasm" });
  try {
    const data = Uint8Array.from([0xde, 0xad, 0xbe, 0xef]);
    assertBytes((await wasmService.bytes({ data })).data, data, "wasm.bytes");
    const fields = await wasmService.fields({ a: 1, b: 2, name: "wasm" });
    assertEqual(fields.name, "wasm", "wasm.fields.name");
    await wasmService
      .fail({ message: "boom" })
      .then(() => {
        throw new Error("wasm: fail should reject");
      })
      .catch((e: Error) => {
        if (!e.message.includes("boom")) throw e;
      });
  } finally {
    await wasmService.destroy();
  }
  await checkRelay("wasm", (hostCall) => EchoService.wasm({ hostCall }));
  // The C++ implementation's wasm reactor (built by ../cpp/bootstrap.sh) through the same host: its
  // relay co_awaits the host call where the Rust one awaits it.
  const cppModule = readFileSync(new URL("../../cpp/build-wasm/echo_cpp.wasm", import.meta.url));
  await checkRelay("wasm (C++)", (hostCall) =>
    EchoService.wasm({ hostCall, module: cppModule }),
  );

  const sync = await EchoServiceSync.create({ backend: "wasm" });
  try {
    assertBytes(
      sync.bytes({ data: Uint8Array.from([1, 2, 3]) }).data,
      Uint8Array.from([1, 2, 3]),
      "wasm sync bytes.data",
    );
  } finally {
    sync.destroy();
  }
  console.error("echo ts package: wasm OK");
  process.exit(0);
}

// Shared memory is the synchronous transport: EchoServiceSync spawns the binary and calls it
// over the rings, and create() picks the same process by default.
if (transportArg === "shm") {
  for (const [label, sync] of [
    ["create()", await EchoServiceSync.create()],
    ["process()", await EchoServiceSync.process()],
  ] as const) {
    try {
      const data = Uint8Array.from([0xde, 0xad, 0xbe, 0xef, 0x42]);
      assertBytes(sync.bytes({ data }).data, data, `shm ${label} bytes.data`);
      const fields = sync.fields({ a: 42, b: 999999, name: "hello shm" });
      assertEqual(fields.name, "hello shm", `shm ${label} fields.name`);
      const hash = testHash(0x10);
      const aliases = sync.aliases({ treeId: 7, hash, maybeHash: null, hashes: [hash] });
      assertBytes(aliases.hash, hash, `shm ${label} aliases.hash`);
      let failed = false;
      try {
        sync.fail({ message: "boom" });
      } catch (e) {
        if (!(e as Error).message.includes("boom")) throw e;
        failed = true;
      }
      if (!failed) throw new Error(`shm ${label}: fail should throw`);
    } finally {
      sync.destroy();
    }
  }
  console.error("echo ts package: shm OK");
  process.exit(0);
}

// A unix socket is the asynchronous transport. The default policy: the echo binary resolves, so
// create() spawns it.
{
  const created = await EchoService.create();
  try {
    if (!created.process) {
      throw new Error("create(): expected a spawned process backend");
    }
    const data = Uint8Array.from([7, 8, 9]);
    assertBytes((await created.bytes({ data })).data, data, "create().bytes");
  } finally {
    await created.destroy();
  }
}

const service = await EchoService.process();
try {
  const data = Uint8Array.from([0xde, 0xad, 0xbe, 0xef, 0x42]);
  const bytes = await service.bytes({ data });
  assertBytes(bytes.data, data, "bytes.data");

  const fields = await service.fields({
    a: 42,
    b: 999999,
    name: "hello generated package",
  });
  assertEqual(fields.a, 42, "fields.a");
  assertEqual(fields.b, 999999, "fields.b");
  assertEqual(fields.name, "hello generated package", "fields.name");

  const inner = {
    values: [Uint8Array.from([1, 2, 3]), Uint8Array.from([4, 5])],
    flag: true,
  };
  const nested = await service.nested({ inner });
  assertEqual(nested.inner.flag, true, "nested.inner.flag");
  assertEqual(nested.inner.values.length, 2, "nested.inner.values.length");
  assertBytes(
    nested.inner.values[0]!,
    inner.values[0]!,
    "nested.inner.values[0]",
  );

  const hash = testHash(0x10);
  const second = testHash(0x40);
  const aliases = await service.aliases({
    treeId: 7,
    hash,
    maybeHash: second,
    hashes: [hash, second],
  });
  assertEqual(aliases.treeId, 7, "aliases.treeId");
  assertBytes(aliases.hash, hash, "aliases.hash");
  assertBytes(aliases.maybeHash!, second, "aliases.maybeHash");
  assertEqual(aliases.hashes.length, 2, "aliases.hashes.length");
} finally {
  await service.destroy();
}
await checkRelay("uds", (hostCall) => EchoService.process({ hostCall }));

console.error("echo ts package: uds OK");
