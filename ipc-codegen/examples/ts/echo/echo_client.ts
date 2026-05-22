/**
 * Echo IPC client (TypeScript) — uses GENERATED types + the @aztec/ipc-runtime
 * UDS transport. Usage: npx tsx echo_client.ts --socket /tmp/echo.sock
 * Exits 0 on success, 1 on failure.
 *
 * The codegen-emitted typed AsyncApi imports interfaces from bb.js paths,
 * so for this standalone test we go directly through the runtime's
 * UdsIpcClient with manual msgpack encoding. Wire format is identical.
 */
import { UdsIpcClient } from "@aztec/ipc-runtime";
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
  console.error("Usage: echo_client.ts --socket <path>");
  process.exit(1);
}

function assertEqual(actual: any, expected: any, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: expected ${e}, got ${a}`);
}

async function call(
  client: UdsIpcClient,
  name: string,
  fields: any,
): Promise<[string, any]> {
  const input = encoder.pack([[name, fields]]);
  const output = await client.call(input);
  return decoder.unpack(output) as [string, any];
}

async function run() {
  const client = await UdsIpcClient.connect(socketPath);

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
