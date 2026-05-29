/**
 * Echo IPC client (TypeScript) — uses GENERATED types + the @aztec/ipc-runtime
 * transport. Defaults to UDS; pass `--transport shm` to drive the bundled
 * NAPI SHM client (`createNapiShmAsyncClient`) instead. Path suffix follows
 * the same convention as ipc::make_client on the C++ side: `.sock` for UDS,
 * `.shm` for MPSC-SHM rings.
 *
 * Usage: npx tsx echo_client.ts --socket /tmp/echo.sock [--transport uds|shm]
 * Exits 0 on success, 1 on failure.
 */
import {
  createNapiShmAsyncClient,
  UdsIpcClient,
  type IpcClientAsync,
} from "@aztec/ipc-runtime";
import { Decoder, Encoder } from "msgpackr";
import type {
  EchoBytesResponse,
  EchoFieldsResponse,
  EchoNestedResponse,
} from "./generated/echo_types.js";

const encoder = new Encoder({ useRecords: false, variableMapSize: true });
const decoder = new Decoder({ useRecords: false });

const args = process.argv.slice(2);
const socketIdx = args.indexOf("--socket");
const socketPath = socketIdx >= 0 ? args[socketIdx + 1] : undefined;
if (!socketPath) {
  console.error("Usage: echo_client.ts --socket <path> [--transport uds|shm]");
  process.exit(1);
}
const transportIdx = args.indexOf("--transport");
const transport = transportIdx >= 0 ? args[transportIdx + 1] : "uds";
if (transport !== "uds" && transport !== "shm") {
  console.error(`Unknown --transport '${transport}' (expected uds|shm)`);
  process.exit(1);
}

function assertEqual(actual: any, expected: any, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: expected ${e}, got ${a}`);
}

async function call(
  client: IpcClientAsync,
  name: string,
  fields: any,
): Promise<[string, any]> {
  const input = encoder.pack([[name, fields]]);
  const output = await client.call(input);
  return decoder.unpack(output) as [string, any];
}

async function run() {
  // SHM clients identify the shared-memory base name without the `.shm`
  // suffix — match ipc::make_client's behaviour on the C++ side.
  const client: IpcClientAsync =
    transport === "shm"
      ? createNapiShmAsyncClient(socketPath.replace(/\.shm$/, ""))
      : await UdsIpcClient.connect(socketPath);

  // Test 1: EchoBytes
  const testData = Buffer.from([0xde, 0xad, 0xbe, 0xef, 0x42]);
  const [name1, resp1] = (await call(client, "EchoBytes", {
    data: testData,
  })) as [string, EchoBytesResponse];
  assertEqual(name1, "EchoBytesResponse", "EchoBytes name");
  assertEqual(
    Buffer.from(resp1.data).toString("hex"),
    testData.toString("hex"),
    "EchoBytes data",
  );
  console.error("echo_client(ts): EchoBytes OK");

  // Test 2: EchoFields
  const [name2, resp2] = (await call(client, "EchoFields", {
    a: 42,
    b: 999999,
    name: "hello wire compat",
  })) as [string, EchoFieldsResponse];
  assertEqual(name2, "EchoFieldsResponse", "EchoFields name");
  assertEqual(resp2.a, 42, "EchoFields a");
  assertEqual(resp2.b, 999999, "EchoFields b");
  assertEqual(resp2.name, "hello wire compat", "EchoFields name field");
  console.error("echo_client(ts): EchoFields OK");

  // Test 3: EchoNested
  const inner = {
    values: [Buffer.from([1, 2, 3]), Buffer.from([4, 5])],
    flag: true,
  };
  const [name3, resp3] = (await call(client, "EchoNested", { inner })) as [
    string,
    EchoNestedResponse,
  ];
  assertEqual(name3, "EchoNestedResponse", "EchoNested name");
  assertEqual(resp3.inner.flag, true, "EchoNested flag");
  assertEqual(resp3.inner.values.length, 2, "EchoNested values length");
  console.error("echo_client(ts): EchoNested OK");

  // Shutdown
  await call(client, "EchoShutdown", {});
  await client.destroy();
  console.error("echo_client(ts): all tests passed");
}

run().catch((e) => {
  console.error(`echo_client(ts): FAILED: ${e.message}`);
  process.exit(1);
});
