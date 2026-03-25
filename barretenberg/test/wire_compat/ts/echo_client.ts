/**
 * Echo IPC client (TypeScript) — connects, sends test commands, verifies responses.
 * Usage: npx tsx echo_client.ts --socket /tmp/echo.sock
 * Exits 0 on success, 1 on failure.
 */

import * as net from 'node:net';
import { Decoder, Encoder } from 'msgpackr';

const encoder = new Encoder({ useRecords: false });
const decoder = new Decoder({ useRecords: false });

const args = process.argv.slice(2);
const socketIdx = args.indexOf('--socket');
const socketPath = socketIdx >= 0 ? args[socketIdx + 1] : undefined;
if (!socketPath) {
  console.error('Usage: echo_client.ts --socket <path>');
  process.exit(1);
}

function sendCommand(conn: net.Socket, commandName: string, fields: any): Promise<[string, any]> {
  return new Promise((resolve, reject) => {
    // Serialize as [[commandName, fields]]
    const packed = encoder.pack([[commandName, fields]]);
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32LE(packed.length, 0);
    conn.write(lenBuf);
    conn.write(packed);

    let buffer = Buffer.alloc(0);
    const onData = (data: Buffer) => {
      buffer = Buffer.concat([buffer, data]);
      if (buffer.length >= 4) {
        const len = buffer.readUInt32LE(0);
        if (buffer.length >= 4 + len) {
          conn.removeListener('data', onData);
          const payload = buffer.subarray(4, 4 + len);
          resolve(decoder.unpack(payload) as [string, any]);
        }
      }
    };
    conn.on('data', onData);
    conn.on('error', reject);
  });
}

function assertEqual(actual: any, expected: any, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${label}: expected ${e}, got ${a}`);
  }
}

async function run() {
  const conn = net.createConnection(socketPath);
  await new Promise<void>((resolve, reject) => {
    conn.on('connect', resolve);
    conn.on('error', reject);
  });

  // Test 1: EchoBytes
  const testData = Buffer.from([0xDE, 0xAD, 0xBE, 0xEF, 0x42]);
  const [name1, resp1] = await sendCommand(conn, 'EchoBytes', { data: testData });
  assertEqual(name1, 'EchoBytesResponse', 'EchoBytes name');
  assertEqual(Buffer.from(resp1.data).toString('hex'), testData.toString('hex'), 'EchoBytes data');
  console.error('echo_client(ts): EchoBytes OK');

  // Test 2: EchoFields
  // Note: b must fit in uint32 range for msgpackr to encode as integer (not float64)
  // Large u64 values would need BigInt handling. This test covers the wire format.
  const [name2, resp2] = await sendCommand(conn, 'EchoFields', { a: 42, b: 999999, name: 'hello wire compat' });
  assertEqual(name2, 'EchoFieldsResponse', 'EchoFields name');
  assertEqual(resp2.a, 42, 'EchoFields a');
  assertEqual(resp2.b, 999999, 'EchoFields b');
  assertEqual(resp2.name, 'hello wire compat', 'EchoFields name field');
  console.error('echo_client(ts): EchoFields OK');

  // Test 3: EchoNested
  const inner = { values: [Buffer.from([1, 2, 3]), Buffer.from([4, 5])], flag: true };
  const [name3, resp3] = await sendCommand(conn, 'EchoNested', { inner });
  assertEqual(name3, 'EchoNestedResponse', 'EchoNested name');
  assertEqual(resp3.inner.flag, true, 'EchoNested flag');
  assertEqual(resp3.inner.values.length, 2, 'EchoNested values length');
  console.error('echo_client(ts): EchoNested OK');

  // Shutdown
  await sendCommand(conn, 'EchoShutdown', {});
  conn.destroy();
  console.error('echo_client(ts): all tests passed');
}

run().catch(e => {
  console.error(`echo_client(ts): FAILED: ${e.message}`);
  process.exit(1);
});
