import { jest } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { isRetryable } from '../errors.js';
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

// A fake bb that writes its pid next to the script before serving, so a replacement process can
// be told apart from the one it replaced.
function writeFakeBbRecordingPid(): { path: string; pids: () => number[] } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-bb-'));
  const serverJs = path.join(dir, 'echo_server.cjs');
  fs.writeFileSync(serverJs, ECHO_SERVER_JS);
  const pidLog = path.join(dir, 'pids');
  const file = path.join(dir, 'bb');
  fs.writeFileSync(file, `#!/bin/bash\necho $$ >> ${pidLog}\nexec node ${serverJs} "$4"\n`, { mode: 0o755 });
  return {
    path: file,
    pids: () => fs.readFileSync(pidLog, 'utf-8').split('\n').filter(Boolean).map(Number),
  };
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

  describe('when bb dies', () => {
    it('fails the call as retryable, and keeps failing without respawn', async () => {
      const fake = writeFakeBbRecordingPid();
      const backend = await BarretenbergNativeSocketAsyncBackend.new(fake.path);
      expect(await backend.call(new Uint8Array([1]))).toEqual(new Uint8Array([1]));

      process.kill(fake.pids()[0], 'SIGKILL');
      await waitUntil(() => !backend.isConnected());

      const err = await backend.call(new Uint8Array([2])).catch(e => e);
      expect(isRetryable(err)).toBe(true);
      // No replacement: the same retryable failure, and no second process.
      expect(isRetryable(await backend.call(new Uint8Array([3])).catch(e => e))).toBe(true);
      expect(fake.pids()).toHaveLength(1);
      await backend.destroy();
    });

    it('serves the next call from a replacement process when respawn is on', async () => {
      const fake = writeFakeBbRecordingPid();
      const backend = await BarretenbergNativeSocketAsyncBackend.new(fake.path, undefined, undefined, undefined, true);
      expect(await backend.call(new Uint8Array([1]))).toEqual(new Uint8Array([1]));

      process.kill(fake.pids()[0], 'SIGKILL');
      await waitUntil(() => !backend.isConnected());

      expect(await backend.call(new Uint8Array([2]))).toEqual(new Uint8Array([2]));
      const pids = fake.pids();
      expect(pids).toHaveLength(2);
      expect(pids[1]).not.toEqual(pids[0]);
      await backend.destroy();
    });

    it('starts one replacement however many calls find the connection down', async () => {
      const fake = writeFakeBbRecordingPid();
      const backend = await BarretenbergNativeSocketAsyncBackend.new(fake.path, undefined, undefined, undefined, true);
      await backend.call(new Uint8Array([1]));

      process.kill(fake.pids()[0], 'SIGKILL');
      await waitUntil(() => !backend.isConnected());

      const results = await Promise.all([1, 2, 3, 4].map(n => backend.call(new Uint8Array([n]))));
      expect(results).toEqual([1, 2, 3, 4].map(n => new Uint8Array([n])));
      expect(fake.pids()).toHaveLength(2);
      await backend.destroy();
    });

    it('does not leave a replacement running when destroyed while it starts', async () => {
      const fake = writeFakeBbRecordingPid();
      const backend = await BarretenbergNativeSocketAsyncBackend.new(fake.path, undefined, undefined, undefined, true);
      await backend.call(new Uint8Array([1]));

      process.kill(fake.pids()[0], 'SIGKILL');
      await waitUntil(() => !backend.isConnected());

      const call = backend.call(new Uint8Array([2])).catch(e => e);
      await backend.destroy();
      expect(String(await call)).toMatch(/Backend connection closed/);

      // destroy() does not wait for the replacement, so watch for it to arrive and then go.
      await waitUntil(() => fake.pids().length === 2);
      await waitUntil(() => !isProcessAlive(fake.pids()[1]));
    });

    it('fails retryably when the replacement cannot start either', async () => {
      // The scenario the option exists for, gone wrong: bb is killed, and its replacement dies
      // under the same pressure before it can connect. The caller must still be told to retry.
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-bb-'));
      const serverJs = path.join(dir, 'echo_server.cjs');
      fs.writeFileSync(serverJs, ECHO_SERVER_JS);
      const pidLog = path.join(dir, 'pids');
      const bb = path.join(dir, 'bb');
      // Serves on the first start; every later start exits before creating its socket.
      fs.writeFileSync(
        bb,
        `#!/bin/bash\nif [ -e ${pidLog} ]; then exit 9; fi\necho $$ >> ${pidLog}\nexec node ${serverJs} "$4"\n`,
        { mode: 0o755 },
      );

      const backend = await BarretenbergNativeSocketAsyncBackend.new(bb, undefined, undefined, undefined, true);
      await backend.call(new Uint8Array([1]));

      process.kill(Number(fs.readFileSync(pidLog, 'utf-8').trim()), 'SIGKILL');
      await waitUntil(() => !backend.isConnected());

      const err = await backend.call(new Uint8Array([2])).catch(e => e);
      expect(isRetryable(err)).toBe(true);
      expect(String(err)).toMatch(/exited before socket connection was established/);
      await backend.destroy();
    });

    it('leaves no bb running when the connection breaks but the process does not exit', async () => {
      // A server that hangs up on the first request and keeps running, as bb does: its client is
      // disconnected, its serve loop is not.
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-bb-'));
      const serverJs = path.join(dir, 'hangup_server.cjs');
      fs.writeFileSync(
        serverJs,
        `const net = require('net');\nnet.createServer(s => s.on('data', () => s.end())).listen(process.argv[2]);\nsetInterval(() => {}, 1000);\n`,
      );
      const pidLog = path.join(dir, 'pids');
      const bb = path.join(dir, 'bb');
      fs.writeFileSync(bb, `#!/bin/bash\necho $$ >> ${pidLog}\nexec node ${serverJs} "$4"\n`, { mode: 0o755 });

      const backend = await BarretenbergNativeSocketAsyncBackend.new(bb);
      const pid = Number(fs.readFileSync(pidLog, 'utf-8').trim());
      await expect(backend.call(new Uint8Array([1]))).rejects.toThrow();

      await waitUntil(() => !isProcessAlive(pid));
      await backend.destroy();
    });
  });
});

/** Poll until `predicate` holds, so a test never depends on when an event lands. */
async function waitUntil(predicate: () => boolean, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error('timed out waiting for condition');
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
