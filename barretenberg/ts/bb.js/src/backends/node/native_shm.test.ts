import { IpcProcessExitedError } from '@aztec-foundation/ipc-runtime';
import { readFileSync, readdirSync } from 'fs';

import { BackendType } from '../index.js';
import { createSyncBackend, findBbBinary } from './index.js';

const bbPath = findBbBinary();
// Linux only: the test finds bb's pid through /proc.
const describeIfBb = bbPath && process.platform === 'linux' ? describe : describe.skip;

/** The pids of this process's children named bb. */
function bbChildPids(): number[] {
  const pids: number[] = [];
  for (const entry of readdirSync('/proc')) {
    if (!/^\d+$/.test(entry)) {
      continue;
    }
    let stat: string;
    try {
      stat = readFileSync(`/proc/${entry}/stat`, 'utf-8');
    } catch {
      continue; // exited since the listing
    }
    // "<pid> (<comm>) <state> <ppid> ...": comm may contain spaces, so split after its closing paren.
    const comm = stat.slice(stat.indexOf('(') + 1, stat.lastIndexOf(')'));
    const ppid = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]);
    if (comm === 'bb' && ppid === process.pid) {
      pids.push(Number(entry));
    }
  }
  return pids;
}

describeIfBb('native shared memory sync backend', () => {
  it('fails a call to a bb that has died with its exit, promptly rather than after a deadline', async () => {
    const before = new Set(bbChildPids());
    const backend = await createSyncBackend(BackendType.NativeSharedMemory, { bbPath: bbPath! }, () => {});
    const [pid] = bbChildPids().filter(p => !before.has(p));
    expect(pid).toBeDefined();

    // Kill bb and call it in the same tick: the sync call holds the main thread, so the child's
    // exit event can't run, and only the native client can notice the death.
    process.kill(pid, 'SIGKILL');
    const start = Date.now();
    let error: unknown;
    try {
      backend.call(new Uint8Array([0x90]));
    } catch (err) {
      error = err;
    }
    expect(Date.now() - start).toBeLessThan(10_000);
    expect(error).toBeInstanceOf(IpcProcessExitedError);
    expect((error as IpcProcessExitedError).signal).toBe('SIGKILL');
    backend.destroy();
  }, 120_000);
});
