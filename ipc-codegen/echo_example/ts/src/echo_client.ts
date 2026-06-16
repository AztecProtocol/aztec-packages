/**
 * Echo IPC client (TypeScript) — uses the GENERATED AsyncApi client over the
 * @aztec/ipc-runtime transport. Defaults to UDS; pass `--transport shm` to
 * drive the bundled NAPI SHM client (`createNapiShmAsyncClient`) instead.
 * Path suffix follows the same convention as ipc::make_client on the C++
 * side: `.sock` for UDS, `.shm` for MPSC-SHM rings.
 *
 * Usage: npx tsx echo_client.ts --socket /tmp/echo.sock [--transport uds|shm]
 * Exits 0 on success, 1 on failure.
 */
import {
  createNapiShmAsyncClient,
  UdsIpcClient,
  type IpcClientAsync,
} from "@aztec/ipc-runtime";
import { AsyncApi } from "./generated/async.js";

const args = process.argv.slice(2);
const socketIdx = args.indexOf("--socket");
const socketPath = socketIdx >= 0 ? args[socketIdx + 1] : undefined;
if (!socketPath) {
  console.error("Usage: echo_client.ts --socket <path> [--transport uds|shm]");
  process.exit(1);
}

function testHash(base: number): Uint8Array {
  return Uint8Array.from({ length: 32 }, (_v, i) => base + i);
}
const transportIdx = args.indexOf("--transport");
const transport = transportIdx >= 0 ? args[transportIdx + 1] : "uds";
if (transport !== "uds" && transport !== "shm") {
  console.error(`Unknown --transport '${transport}' (expected uds|shm)`);
  process.exit(1);
}

function assertEqual(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: expected ${e}, got ${a}`);
}

function assertBytes(actual: Uint8Array, expected: Uint8Array, label: string) {
  assertEqual(
    Buffer.from(actual).toString("hex"),
    Buffer.from(expected).toString("hex"),
    label,
  );
}

async function run() {
  // SHM clients identify the shared-memory base name without the `.shm`
  // suffix — match ipc::make_client's behaviour on the C++ side.
  const client: IpcClientAsync =
    transport === "shm"
      ? createNapiShmAsyncClient(socketPath!.replace(/\.shm$/, ""))
      : await UdsIpcClient.connect(socketPath!);
  const api = new AsyncApi(client);

  // Test 1: EchoBytes
  const testData = Uint8Array.from([0xde, 0xad, 0xbe, 0xef, 0x42]);
  const resp1 = await api.echoBytes({ data: testData });
  assertBytes(resp1.data, testData, "EchoBytes data");
  console.error("echo_client(ts): EchoBytes OK");

  // Test 2: EchoFields
  const resp2 = await api.echoFields({
    a: 42,
    b: 999999,
    name: "hello wire compat",
  });
  assertEqual(resp2.a, 42, "EchoFields a");
  assertEqual(resp2.b, 999999, "EchoFields b");
  assertEqual(resp2.name, "hello wire compat", "EchoFields name field");
  console.error("echo_client(ts): EchoFields OK");

  // Test 3: EchoNested
  const inner = {
    values: [Uint8Array.from([1, 2, 3]), Uint8Array.from([4, 5])],
    flag: true,
  };
  const resp3 = await api.echoNested({ inner });
  assertEqual(resp3.inner.flag, true, "EchoNested flag");
  assertEqual(resp3.inner.values.length, 2, "EchoNested values length");
  assertBytes(resp3.inner.values[0]!, inner.values[0]!, "EchoNested values[0]");
  console.error("echo_client(ts): EchoNested OK");

  // Test 4: EchoAliases
  const hash = testHash(0x10);
  const second = testHash(0x40);
  const resp4 = await api.echoAliases({
    treeId: 7,
    hash,
    maybeHash: second,
    hashes: [hash, second],
  });
  assertEqual(resp4.treeId, 7, "EchoAliases treeId");
  assertBytes(resp4.hash, hash, "EchoAliases hash");
  assertBytes(resp4.maybeHash!, second, "EchoAliases maybeHash");
  assertEqual(resp4.hashes.length, 2, "EchoAliases hashes length");
  assertBytes(resp4.hashes[0]!, hash, "EchoAliases hashes[0]");
  assertBytes(resp4.hashes[1]!, second, "EchoAliases hashes[1]");
  console.error("echo_client(ts): EchoAliases OK");

  // Test 5: EchoAliases with maybeHash absent (optional over live IPC)
  const resp5 = await api.echoAliases({
    treeId: 7,
    hash,
    maybeHash: null,
    hashes: [hash],
  });
  assertEqual(resp5.maybeHash, null, "EchoAliases maybeHash none");
  console.error("echo_client(ts): EchoAliases none OK");

  // Test 6: EchoFields with b > 2^32 (uint64 wire encoding over live IPC)
  const big = Number.MAX_SAFE_INTEGER;
  const resp6 = await api.echoFields({ a: 42, b: big, name: "big" });
  assertEqual(resp6.b, big, "EchoFields u64");
  // Values past 2^53 must throw client-side rather than silently lose precision.
  let threw = false;
  try {
    await api.echoFields({ a: 42, b: 2 ** 60, name: "too big" });
  } catch {
    threw = true;
  }
  assertEqual(threw, true, "EchoFields u64 guard");
  console.error("echo_client(ts): EchoFields u64 OK");

  // Test 7: EchoBlobs — optional bytes Some/None and fixed [bytes; 2]
  const resp7 = await api.echoBlobs({
    maybeData: Uint8Array.from([0xaa, 0xbb]),
    parts: [Uint8Array.from([1, 2, 3]), Uint8Array.from([4])],
  });
  assertBytes(
    resp7.maybeData!,
    Uint8Array.from([0xaa, 0xbb]),
    "EchoBlobs maybeData",
  );
  assertBytes(
    resp7.parts[0]!,
    Uint8Array.from([1, 2, 3]),
    "EchoBlobs parts[0]",
  );
  assertBytes(resp7.parts[1]!, Uint8Array.from([4]), "EchoBlobs parts[1]");
  const resp7b = await api.echoBlobs({
    maybeData: null,
    parts: [Uint8Array.from([]), Uint8Array.from([9])],
  });
  assertEqual(resp7b.maybeData, null, "EchoBlobs maybeData none");
  console.error("echo_client(ts): EchoBlobs OK");

  // Test 8: EchoFail — server error surfaces with its message
  let failMessage = "";
  try {
    await api.echoFail({ message: "deliberate failure" });
  } catch (e: any) {
    failMessage = e.message;
  }
  if (!failMessage.includes("deliberate failure")) {
    throw new Error(`EchoFail: expected error message, got '${failMessage}'`);
  }
  console.error("echo_client(ts): EchoFail OK");

  await api.destroy();
  console.error("echo_client(ts): all tests passed");
}

run().catch((e) => {
  console.error(`echo_client(ts): FAILED: ${e.message}`);
  process.exit(1);
});
