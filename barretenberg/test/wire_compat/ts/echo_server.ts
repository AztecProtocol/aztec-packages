/**
 * Echo IPC server (TypeScript) — uses GENERATED types and dispatch.
 * Usage: npx tsx echo_server.ts --socket /tmp/echo.sock
 */

import * as net from 'node:net';
import * as fs from 'node:fs';
import { Decoder, Encoder } from 'msgpackr';
import type { Handler } from './generated/server.js';
import { dispatch } from './generated/server.js';
import type { EchoBytes, EchoBytesResponse, EchoFields, EchoFieldsResponse, EchoNested, EchoNestedResponse } from './generated/api_types.js';

const encoder = new Encoder({ useRecords: false, int64AsNumber: true });
const decoder = new Decoder({ useRecords: false, int64AsNumber: true });

const args = process.argv.slice(2);
const socketIdx = args.indexOf('--socket');
const socketPath = socketIdx >= 0 ? args[socketIdx + 1] : undefined;
if (!socketPath) {
  console.error('Usage: echo_server.ts --socket <path>');
  process.exit(1);
}

try { fs.unlinkSync(socketPath); } catch {}

// Implement the GENERATED Handler interface
const handler: Handler = {
  async echoBytes(cmd: EchoBytes): Promise<EchoBytesResponse> {
    return { data: cmd.data };
  },
  async echoFields(cmd: EchoFields): Promise<EchoFieldsResponse> {
    return { a: cmd.a, b: cmd.b, name: cmd.name };
  },
  async echoNested(cmd: EchoNested): Promise<EchoNestedResponse> {
    return { inner: cmd.inner };
  },
};

const server = net.createServer((conn) => {
  let buffer = Buffer.alloc(0);

  conn.on('data', (data: Buffer) => {
    buffer = Buffer.concat([buffer, data]);

    while (buffer.length >= 4) {
      const len = buffer.readUInt32LE(0);
      if (buffer.length < 4 + len) break;

      const payload = buffer.subarray(4, 4 + len);
      buffer = buffer.subarray(4 + len);

      const request = decoder.unpack(payload) as any[];
      const [commandName, fields] = request[0] as [string, any];

      if (commandName === 'EchoShutdown') {
        sendResponse(conn, ['EchoShutdownResponse', {}]);
        setTimeout(() => {
          server.close();
          try { fs.unlinkSync(socketPath); } catch {}
          console.error('echo_server(ts): shutdown');
          process.exit(0);
        }, 50);
        return;
      }

      // Use GENERATED dispatch function
      dispatch(handler, commandName, fields).then(([respName, respFields]) => {
        sendResponse(conn, [respName, respFields]);
      }).catch(err => {
        sendResponse(conn, ['EchoErrorResponse', { message: err.message }]);
      });
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
