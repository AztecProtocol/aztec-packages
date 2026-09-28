import { jest } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { Barretenberg } from '../../barretenberg/index.js';
import { BackendType } from '../index.js';
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

// Server that closes the connection on the first request and keeps running.
const HANGUP_SERVER_JS = `
const net = require('net');
const server = net.createServer(sock => sock.on('data', () => sock.end()));
server.listen(process.argv[2]);
`;

// A fake bb binary: a bash script that optionally sleeps, then runs the given server on the
// socket path bb receives via `msgpack run --input <path>` ($4). It records its pid, which `exec`
// keeps, in a `pid` file next to the script.
function writeFakeBb(startupDelaySecs: number, serverSource = ECHO_SERVER_JS): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-bb-'));
  const serverJs = path.join(dir, 'server.cjs');
  fs.writeFileSync(serverJs, serverSource);
  const file = path.join(dir, 'bb');
  const sleep = startupDelaySecs > 0 ? `sleep ${startupDelaySecs}\n` : '';
  fs.writeFileSync(file, `#!/bin/bash\necho $$ > "${dir}/pid"\n${sleep}exec node ${serverJs} "$4"\n`, {
    mode: 0o755,
  });
  return file;
}

function readFakeBbPid(fakeBb: string): number {
  return Number(fs.readFileSync(path.join(path.dirname(fakeBb), 'pid'), 'utf8').trim());
}

// Backends destroyed after each test, so a failed assertion cannot leave a fake bb running and its
// socket holding jest open.
const started: { destroy(): Promise<void> }[] = [];

function track<T extends { destroy(): Promise<void> }>(backend: T): T {
  started.push(backend);
  return backend;
}

afterEach(async () => {
  await Promise.all(started.splice(0).map(backend => backend.destroy()));
});

async function waitUntil(condition: () => boolean, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(`Condition not met within ${timeoutMs}ms`);
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
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
    const backend = track(await BarretenbergNativeSocketAsyncBackend.new(fakeBb));
    const response = await backend.call(new Uint8Array([1, 2, 3, 4]));
    expect(response).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it('connects even when bb takes longer than 5s to create its socket', async () => {
    const fakeBb = writeFakeBb(7);
    const backend = track(await BarretenbergNativeSocketAsyncBackend.new(fakeBb));
    const response = await backend.call(new Uint8Array([42]));
    expect(response).toEqual(new Uint8Array([42]));
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

  it('is alive while connected and not alive after destroy', async () => {
    const backend = track(await BarretenbergNativeSocketAsyncBackend.new(writeFakeBb(0)));
    expect(backend.isAlive()).toBe(true);
    await backend.destroy();
    expect(backend.isAlive()).toBe(false);
  });

  it('stops being alive when the bb process is killed', async () => {
    const fakeBb = writeFakeBb(0);
    const backend = track(await BarretenbergNativeSocketAsyncBackend.new(fakeBb));
    process.kill(readFakeBbPid(fakeBb), 'SIGKILL');
    await waitUntil(() => !backend.isAlive());
    await expect(backend.call(new Uint8Array([1]))).rejects.toThrow('Socket not connected');
  });

  it('stops being alive when bb closes the connection while still running', async () => {
    const fakeBb = writeFakeBb(0, HANGUP_SERVER_JS);
    const backend = track(await BarretenbergNativeSocketAsyncBackend.new(fakeBb));
    await expect(backend.call(new Uint8Array([1]))).rejects.toThrow('Socket connection ended unexpectedly');
    expect(backend.isAlive()).toBe(false);
    expect(() => process.kill(readFakeBbPid(fakeBb), 0)).not.toThrow();
  });
});

describe('Barretenberg over the native socket backend', () => {
  afterEach(() => Barretenberg.destroySingleton());

  it('reports the backend dead once the bb process is killed', async () => {
    const fakeBb = writeFakeBb(0);
    const api = track(await Barretenberg.new({ backend: BackendType.NativeUnixSocket, bbPath: fakeBb }));
    expect(api.isAlive()).toBe(true);
    process.kill(readFakeBbPid(fakeBb), 'SIGKILL');
    await waitUntil(() => !api.isAlive());
  });

  it('replaces a singleton whose bb process was killed', async () => {
    const fakeBb = writeFakeBb(0);
    const options = { backend: BackendType.NativeUnixSocket, bbPath: fakeBb };
    const first = await Barretenberg.initSingleton(options);
    const firstPid = readFakeBbPid(fakeBb);
    process.kill(firstPid, 'SIGKILL');
    await waitUntil(() => !first.isAlive());

    const second = await Barretenberg.initSingleton(options);
    expect(second).not.toBe(first);
    expect(second.isAlive()).toBe(true);
    expect(readFakeBbPid(fakeBb)).not.toBe(firstPid);
    expect(Barretenberg.getSingleton()).toBe(second);
  });
});
