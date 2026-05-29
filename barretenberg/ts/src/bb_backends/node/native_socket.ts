import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import readline from 'readline';
import { threadId } from 'worker_threads';
import { UdsIpcClient } from '@aztec/ipc-runtime';
import { IMsgpackBackendAsync } from '../interface.js';

let instanceCounter = 0;

/**
 * Async native backend that talks to the `bb` binary over a Unix Domain
 * Socket. bb owns the socket (server side); this class spawns the bb
 * process, waits for the socket file to appear, and delegates the wire
 * protocol to @aztec/ipc-runtime's UdsIpcClient.
 *
 * The transport (4-byte LE length prefix + msgpack) is identical across
 * every language client of bb. Length-prefix framing, FIFO pipelining,
 * and connect retry all live in UdsIpcClient.
 */
export class BarretenbergNativeSocketAsyncBackend implements IMsgpackBackendAsync {
  private process: ChildProcess;
  private socketPath: string;
  private clientPromise: Promise<UdsIpcClient>;
  private client: UdsIpcClient | null = null;
  private destroyed = false;

  constructor(bbBinaryPath: string, threads?: number, logger?: (msg: string) => void, unref?: boolean) {
    this.socketPath = path.join(os.tmpdir(), `bb-${process.pid}-${threadId}-${instanceCounter++}.sock`);
    if (fs.existsSync(this.socketPath)) {
      fs.unlinkSync(this.socketPath);
    }

    const hwc = threads ? threads.toString() : Math.min(16, os.cpus().length).toString();
    const env = { ...process.env, HARDWARE_CONCURRENCY: hwc };

    const args = ['msgpack', 'run', '--input', this.socketPath];
    this.process = spawn(bbBinaryPath, args, {
      stdio: ['ignore', logger ? 'pipe' : 'ignore', logger ? 'pipe' : 'ignore'],
      env,
    });

    // bb has parent-death monitoring; we don't need the event loop pinned
    // open by the child process handle.
    this.process.unref();

    if (logger) {
      logger("Logger attached to bb process. DON'T FORGET TO DESTROY THE BACKEND to allow Node.js to exit.");
      readline.createInterface({ input: this.process.stdout! }).on('line', logger);
      readline.createInterface({ input: this.process.stderr! }).on('line', logger);
      if (unref) {
        (this.process.stdout as any)?.unref?.();
        (this.process.stderr as any)?.unref?.();
      }
    }

    this.clientPromise = this.waitForSocketAndConnect();

    // Surface process exit / spawn errors. UdsIpcClient already rejects
    // in-flight calls on socket close; this catches the case where the
    // process dies before we ever connect.
    this.process.on('error', err => this.abortPending(new Error(`Native backend process error: ${err.message}`)));
    this.process.on('exit', (code, signal) => {
      const msg =
        code !== null && code !== 0
          ? `Native backend process exited with code ${code}`
          : signal && signal !== 'SIGTERM'
            ? `Native backend process killed with signal ${signal}`
            : 'Native backend process exited unexpectedly';
      this.abortPending(new Error(msg));
    });
  }

  private async waitForSocketAndConnect(): Promise<UdsIpcClient> {
    const start = Date.now();
    while (!fs.existsSync(this.socketPath)) {
      if (Date.now() - start > 5000) {
        throw new Error('Timeout waiting for bb to create socket file');
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (!fs.statSync(this.socketPath).isSocket()) {
      throw new Error(`Path exists but is not a socket: ${this.socketPath}`);
    }
    const client = await UdsIpcClient.connect(this.socketPath, {
      connectTimeoutMs: Math.max(0, 5000 - (Date.now() - start)),
    });
    this.client = client;
    return client;
  }

  async call(inputBuffer: Uint8Array): Promise<Uint8Array> {
    const client = await this.clientPromise;
    if (this.destroyed) throw new Error('Backend destroyed');
    // Hold the event loop open only while we have outstanding work; unref
    // again as soon as the queue drains so an idle bb client doesn't keep
    // the host process alive.
    if (client.inflight === 0) client.socket.ref();
    try {
      return await client.call(inputBuffer);
    } finally {
      if (client.inflight === 0) client.socket.unref();
    }
  }

  private abortPending(err: Error): void {
    if (this.client) {
      this.client.destroy().catch(() => {});
      this.client = null;
    }
  }

  async destroy(): Promise<void> {
    this.destroyed = true;
    if (this.client) {
      await this.client.destroy();
      this.client = null;
    }
    this.process.removeAllListeners();
    this.process.kill('SIGTERM');
  }
}
