/**
 * Generic IPC server over Unix Domain Sockets.
 * Handles: socket setup, accept, length-prefixed framing, msgpack decode/encode.
 * Service-specific dispatch is injected via the dispatchFn parameter.
 */
import * as net from 'node:net';
import * as fs from 'node:fs';
import { Decoder, Encoder } from 'msgpackr';

const encoder = new Encoder({ useRecords: false });
const decoder = new Decoder({ useRecords: false });

export type DispatchFn = (commandName: string, payload: any) => Promise<[string, any]>;

export function createServer(socketPath: string, dispatchFn: DispatchFn): { close: () => Promise<void> } {
  try { fs.unlinkSync(socketPath); } catch {}

  const server = net.createServer((conn) => {
    let buffer = Buffer.alloc(0);
    let responseChain: Promise<void> = Promise.resolve();

    conn.on('data', (data: Buffer) => {
      buffer = Buffer.concat([buffer, data]);

      while (buffer.length >= 4) {
        const len = buffer.readUInt32LE(0);
        if (buffer.length < 4 + len) break;

        const payload = buffer.subarray(4, 4 + len);
        buffer = buffer.subarray(4 + len);

        const request = decoder.unpack(payload) as any[];
        const [commandName, fields] = request[0] as [string, any];

        if (commandName.endsWith('Shutdown')) {
          sendResponse(conn, [commandName.replace(/^(.*)$/, '$1Response'), {}]);
          setTimeout(() => {
            server.close();
            try { fs.unlinkSync(socketPath); } catch {}
          }, 50);
          return;
        }

        const prev = responseChain;
        const result = dispatchFn(commandName, fields ?? {});
        responseChain = (async () => {
          await prev;
          try {
            const [name, resp] = await result;
            sendResponse(conn, [name, resp]);
          } catch (err: any) {
            sendResponse(conn, ['ErrorResponse', { message: err.message ?? 'Unknown error' }]);
          }
        })();
        void responseChain.catch(() => {});
      }
    });

    conn.on('error', () => {});
  });

  server.listen(socketPath, () => {
    console.error(`ipc-server(ts): listening on ${socketPath}`);
  });

  return {
    close: () => new Promise<void>(resolve => {
      server.close(() => {
        try { fs.unlinkSync(socketPath); } catch {}
        resolve();
      });
    }),
  };
}

function sendResponse(conn: net.Socket, response: [string, any]) {
  const packed = encoder.pack(response);
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32LE(packed.length, 0);
  conn.write(lenBuf);
  conn.write(packed);
}
