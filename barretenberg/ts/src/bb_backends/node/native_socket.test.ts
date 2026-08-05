import { jest } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BarretenbergNativeSocketAsyncBackend } from './native_socket.js';

jest.setTimeout(30_000);

// Echo server speaking the bb msgpack socket protocol (4-byte LE length prefix), started after
// an optional delay to simulate bb's startup time on a loaded machine.
const ECHO_SERVER_JS = `
const net = require('net');
const socketPath = process.argv[2];
const server = net.createServer(sock => {
  let buf = Buffer.alloc(0);
  sock.on('data', d => {
    buf = Buffer.concat([buf, d]);
    while (buf.length >= 4) {
      const len = buf.readUInt32LE(0);
      if (buf.length < 4 + len) break;
      const payload = buf.subarray(4, 4 + len);
      const out = Buffer.alloc(4);
      out.writeUInt32LE(payload.length, 0);
      sock.write(out);
      sock.write(payload);
      buf = buf.subarray(4 + len);
    }
  });
});
server.listen(socketPath);
`;

// A fake bb binary: a bash script that optionally sleeps, then runs the echo server on the
// socket path bb receives via `msgpack run --input <path>` ($4).
function writeFakeBb(startupDelaySecs: number): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-bb-'));
  const serverJs = path.join(dir, 'echo_server.cjs');
  fs.writeFileSync(serverJs, ECHO_SERVER_JS);
  const file = path.join(dir, 'bb');
  const sleep = startupDelaySecs > 0 ? `sleep ${startupDelaySecs}\n` : '';
  fs.writeFileSync(file, `#!/bin/bash\n${sleep}exec node ${serverJs} "$4"\n`, { mode: 0o755 });
  return file;
}

function writeFakeBbScript(script: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-bb-'));
  const file = path.join(dir, 'bb');
  fs.writeFileSync(file, script, { mode: 0o755 });
  return file;
}

describe('BarretenbergNativeSocketAsyncBackend', () => {
  it('connects and echoes when bb starts promptly', async () => {
    const fakeBb = writeFakeBb(0);
    const backend = await BarretenbergNativeSocketAsyncBackend.new(fakeBb);
    const response = await backend.call(new Uint8Array([1, 2, 3, 4]));
    expect(response).toEqual(new Uint8Array([1, 2, 3, 4]));
    await backend.destroy();
  });

  it('connects even when bb takes longer than 5s to create its socket', async () => {
    const fakeBb = writeFakeBb(7);
    const backend = await BarretenbergNativeSocketAsyncBackend.new(fakeBb);
    const response = await backend.call(new Uint8Array([42]));
    expect(response).toEqual(new Uint8Array([42]));
    await backend.destroy();
  });

  it('fails with the exit cause when bb dies before creating its socket', async () => {
    const fakeBb = writeFakeBbScript(`#!/bin/bash\nexit 17\n`);
    await expect(BarretenbergNativeSocketAsyncBackend.new(fakeBb)).rejects.toThrow(
      /exited before socket connection was established \(code=17/,
    );
  });

  it('fails with the spawn error when the bb binary does not exist', async () => {
    await expect(BarretenbergNativeSocketAsyncBackend.new('/nonexistent/bb-binary')).rejects.toThrow(
      /Native backend process error/,
    );
  });
});
