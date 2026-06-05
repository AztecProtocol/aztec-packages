import { EchoService, type EchoTransport } from "./index.js";

const args = process.argv.slice(2);
const transportArg = args[args.indexOf("--transport") + 1] ?? "uds";
if (transportArg !== "uds" && transportArg !== "shm") {
  throw new Error(`Unknown --transport '${transportArg}'`);
}
const transport = transportArg as EchoTransport;

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

const service = await EchoService.spawn({ transport });
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
  assertBytes(nested.inner.values[0]!, inner.values[0]!, "nested.inner.values[0]");

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

  await service.shutdown({});
} finally {
  await service.destroy();
}

console.error(`echo ts package: ${transport} OK`);
