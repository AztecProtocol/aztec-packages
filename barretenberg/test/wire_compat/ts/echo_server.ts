/**
 * Echo IPC server (TypeScript) — echoes commands back as responses.
 * Usage: npx tsx echo_server.ts --socket /tmp/echo.sock
 */

import * as net from 'node:net';
import * as fs from 'node:fs';
import { Decoder, Encoder } from 'msgpackr';

const encoder = new Encoder({ useRecords: false, int64AsNumber: true });
const decoder = new Decoder({ useRecords: false, int64AsNumber: true });

const args = process.argv.slice(2);
const socketIdx = args.indexOf('--socket');
const socketPath = socketIdx >= 0 ? args[socketIdx + 1] : undefined;
if (!socketPath) {
  console.error('Usage: echo_server.ts --socket <path>');
  process.exit(1);
}

// Remove stale socket
try { fs.unlinkSync(socketPath); } catch {}

const server = net.createServer((conn) => {
  let buffer = Buffer.alloc(0);

  conn.on('data', (data: Buffer) => {
    buffer = Buffer.concat([buffer, data]);

    while (buffer.length >= 4) {
      const len = buffer.readUInt32LE(0);
      if (buffer.length < 4 + len) break;

      const payload = buffer.subarray(4, 4 + len);
      buffer = buffer.subarray(4 + len);

      // Decode: [[commandName, {fields}]]
      const request = decoder.unpack(payload) as any[];
      const [commandName, fields] = request[0] as [string, any];

      let responseName: string;
      let responseFields: any;

      switch (commandName) {
        case 'EchoBytes':
          responseName = 'EchoBytesResponse';
          responseFields = { data: fields.data };
          break;
        case 'EchoFields':
          responseName = 'EchoFieldsResponse';
          responseFields = { a: fields.a, b: fields.b, name: fields.name };
          break;
        case 'EchoNested':
          responseName = 'EchoNestedResponse';
          responseFields = { inner: fields.inner };
          break;
        case 'EchoShutdown':
          responseName = 'EchoShutdownResponse';
          responseFields = {};
          // Send response then exit
          sendResponse(conn, [responseName, responseFields]);
          setTimeout(() => {
            server.close();
            try { fs.unlinkSync(socketPath); } catch {}
            console.error('echo_server(ts): shutdown');
            process.exit(0);
          }, 50);
          return;
        default:
          responseName = 'EchoErrorResponse';
          responseFields = { message: `Unknown command: ${commandName}` };
      }

      sendResponse(conn, [responseName, responseFields]);
    }
  });
});

function sendResponse(conn: net.Socket, response: [string, any]) {
  const packed = encoder.pack(response);
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32LE(packed.length, 0);
  conn.write(lenBuf);
  conn.write(packed);
}

server.listen(socketPath, () => {
  console.error(`echo_server(ts): listening on ${socketPath}`);
});
