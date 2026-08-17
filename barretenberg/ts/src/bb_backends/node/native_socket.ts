import { spawn, ChildProcess } from 'child_process';
import { once } from 'events';
import * as net from 'net';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { IMsgpackBackendAsync } from '../interface.js';
import readline from 'readline';
import { threadId } from 'worker_threads';

let instanceCounter = 0;

// Backstop for a bb process that is alive but wedged before listen(). Deliberately generous:
// on a fully loaded prover many bb processes can spawn simultaneously and startup time has no
// useful upper bound, so this must only ever fire when bb is genuinely stuck, never under load.
const STARTUP_TIMEOUT_MS = 60_000;

/**
 * Asynchronous native backend that communicates with bb binary via Unix Domain Socket.
 * Uses event-based I/O with a state machine to handle partial reads.
 *
 * Architecture: bb acts as the SERVER, TypeScript is the CLIENT
 * - bb creates the socket and listens for connections
 * - TypeScript waits for socket file to exist, then connects
 *
 * Protocol:
 * - Request: 4-byte little-endian length + msgpack buffer
 * - Response: 4-byte little-endian length + msgpack buffer
 */
export class BarretenbergNativeSocketAsyncBackend implements IMsgpackBackendAsync {
  private socket: net.Socket | null;

  // Queue of pending callbacks for pipelined requests
  // Responses come back in FIFO order, so we match them with queued callbacks
  private pendingCallbacks: Array<{
    resolve: (data: Uint8Array) => void;
    reject: (error: Error) => void;
  }> = [];

  // State machine for reading responses
  private readingLength: boolean = true;
  private lengthBuffer: Buffer = Buffer.alloc(4);
  private lengthBytesRead: number = 0;
  private responseLength: number = 0;
  private responseBuffer: Buffer | null = null;
  private responseBytesRead: number = 0;

  private constructor(
    private process: ChildProcess,
    socket: net.Socket,
  ) {
    this.socket = socket;

    this.process.on('error', err => {
      this.failAllPending(new Error(`Native backend process error: ${err.message}`));
    });

    this.process.on('exit', (code, signal) => {
      const errorMsg =
        code !== null && code !== 0
          ? `Native backend process exited with code ${code}`
          : signal && signal !== 'SIGTERM'
            ? `Native backend process killed with signal ${signal}`
            : 'Native backend process exited unexpectedly';
      this.failAllPending(new Error(errorMsg));
    });

    socket.on('data', (chunk: Buffer) => {
      this.handleData(chunk);
    });

    socket.on('error', err => {
      this.failAllPending(new Error(`Socket error: ${err.message}`));
    });

    socket.on('end', () => {
      this.failAllPending(new Error('Socket connection ended unexpectedly'));
    });
  }

  /**
   * Spawn a bb process and wait until a socket connection to it is established.
   * Waits as long as the bb process is alive (bb startup has no useful upper bound on a loaded
   * machine), failing fast with the real cause if the process dies, and killing the process if
   * it is still not accepting connections after the generous STARTUP_TIMEOUT_MS backstop.
   */
  static async new(
    bbBinaryPath: string,
    threads?: number,
    logger?: (msg: string) => void,
    unref?: boolean,
  ): Promise<BarretenbergNativeSocketAsyncBackend> {
    // Create a unique socket path in temp directory
    const socketPath = path.join(os.tmpdir(), `bb-${process.pid}-${threadId}-${instanceCounter++}.sock`);

    // Ensure socket path doesn't already exist (cleanup from previous crashes)
    if (fs.existsSync(socketPath)) {
      fs.unlinkSync(socketPath);
    }

    // If threads not set use num cpu cores, max 16.
    const hwc = threads ? threads.toString() : Math.min(16, os.cpus().length).toString();
    const env = { ...process.env, HARDWARE_CONCURRENCY: hwc };

    // Spawn bb process - it will create the socket server
    const args = ['msgpack', 'run', '--input', socketPath];
    const proc = spawn(bbBinaryPath, args, {
      stdio: ['ignore', logger ? 'pipe' : 'ignore', logger ? 'pipe' : 'ignore'],
      env,
    });

    // Disconnect from event loop so process can exit without waiting for bb
    // The bb process has parent death monitoring (prctl on Linux, kqueue on macOS)
    // so it will automatically exit when Node.js exits
    proc.unref();

    if (logger) {
      logger("Logger attached to bb process. DON'T FORGET TO DESTROY THE BACKEND to allow Node.js to exit.");
      readline.createInterface({ input: proc.stdout! }).on('line', logger);
      readline.createInterface({ input: proc.stderr! }).on('line', logger);
      if (unref) {
        (proc.stdout as any)?.unref?.();
        (proc.stderr as any)?.unref?.();
      }
    }

    // Spawn failures (e.g. missing binary) surface only as an 'error' event, never as 'exit',
    // so wait for the spawn/error outcome up front. Once 'spawn' has fired, every later death
    // is observable via exitCode/signalCode in the connect loop below.
    try {
      await once(proc, 'spawn');
    } catch (err) {
      throw new Error(`Native backend process error: ${(err as Error).message}`);
    }

    try {
      const socket = await this.waitForSocketAndConnect(socketPath, proc);
      return new BarretenbergNativeSocketAsyncBackend(proc, socket);
    } catch (err) {
      proc.kill('SIGKILL');
      throw err;
    }
  }

  private static async waitForSocketAndConnect(socketPath: string, proc: ChildProcess): Promise<net.Socket> {
    const startTime = Date.now();
    for (;;) {
      if (proc.exitCode !== null || proc.signalCode !== null) {
        throw new Error(
          `bb process exited before socket connection was established (code=${proc.exitCode} signal=${proc.signalCode})`,
        );
      }
      if (Date.now() - startTime > STARTUP_TIMEOUT_MS) {
        throw new Error(
          `bb process is alive but did not accept a socket connection within ${STARTUP_TIMEOUT_MS}ms: ${socketPath}`,
        );
      }

      if (fs.existsSync(socketPath)) {
        const stats = fs.statSync(socketPath);
        if (!stats.isSocket()) {
          throw new Error(`Path exists but is not a socket: ${socketPath}`);
        }
        try {
          return await this.attemptConnect(socketPath);
        } catch (err) {
          const code = (err as NodeJS.ErrnoException).code;
          if (code !== 'ECONNREFUSED') {
            throw new Error(`Failed to connect to bb socket: ${(err as Error).message}`);
          }
          // bb has bound the path but not yet called listen(); fall through and retry.
        }
      }

      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  private static attemptConnect(socketPath: string): Promise<net.Socket> {
    return new Promise<net.Socket>((resolve, reject) => {
      const socket = net.connect(socketPath);
      socket.setNoDelay(true);
      const onConnect = () => {
        socket.removeListener('error', onError);
        resolve(socket);
      };
      const onError = (err: Error) => {
        socket.removeListener('connect', onConnect);
        socket.destroy();
        reject(err);
      };
      socket.once('connect', onConnect);
      socket.once('error', onError);
    });
  }

  private failAllPending(error: Error): void {
    for (const callback of this.pendingCallbacks) {
      callback.reject(error);
    }
    this.pendingCallbacks = [];
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
  }

  private handleData(chunk: Buffer): void {
    let offset = 0;

    while (offset < chunk.length) {
      if (this.readingLength) {
        // Reading 4-byte length prefix
        const bytesToCopy = Math.min(4 - this.lengthBytesRead, chunk.length - offset);
        chunk.copy(this.lengthBuffer, this.lengthBytesRead, offset, offset + bytesToCopy);
        this.lengthBytesRead += bytesToCopy;
        offset += bytesToCopy;

        if (this.lengthBytesRead === 4) {
          // Length is complete, switch to reading data
          this.responseLength = this.lengthBuffer.readUInt32LE(0);
          this.responseBuffer = Buffer.alloc(this.responseLength);
          this.responseBytesRead = 0;
          this.readingLength = false;
        }
      } else {
        // Reading response data
        const bytesToCopy = Math.min(this.responseLength - this.responseBytesRead, chunk.length - offset);
        chunk.copy(this.responseBuffer!, this.responseBytesRead, offset, offset + bytesToCopy);
        this.responseBytesRead += bytesToCopy;
        offset += bytesToCopy;

        if (this.responseBytesRead === this.responseLength) {
          // Response is complete - dequeue the next pending callback (FIFO)
          const callback = this.pendingCallbacks.shift();
          if (callback) {
            callback.resolve(new Uint8Array(this.responseBuffer!));
          } else {
            // This shouldn't happen - response without a pending request
            console.warn('Received response but no pending callback');
          }

          // If no more pending callbacks, unref socket to allow process to exit
          if (this.pendingCallbacks.length === 0 && this.socket) {
            this.socket.unref();
          }

          // Reset state for next message
          this.readingLength = true;
          this.lengthBytesRead = 0;
          this.responseLength = 0;
          this.responseBuffer = null;
          this.responseBytesRead = 0;
        }
      }
    }
  }

  call(inputBuffer: Uint8Array): Promise<Uint8Array> {
    if (!this.socket) {
      return Promise.reject(new Error('Socket not connected'));
    }

    return new Promise((resolve, reject) => {
      // If this is the first pending callback, ref the socket to keep event loop alive
      if (this.pendingCallbacks.length === 0) {
        this.socket!.ref();
      }

      // Enqueue this promise's callbacks (FIFO order)
      this.pendingCallbacks.push({ resolve, reject });

      // Write request: 4-byte little-endian length + msgpack data
      // Socket will buffer these if needed, maintaining order
      const lengthBuf = Buffer.alloc(4);
      lengthBuf.writeUInt32LE(inputBuffer.length, 0);
      this.socket!.write(lengthBuf);
      this.socket!.write(inputBuffer);
    });
  }

  async destroy(): Promise<void> {
    this.failAllPending(new Error('Backend connection closed'));
    // Don't try to unlink socket - bb owns it and will clean it up
    this.process.kill('SIGTERM');
    this.process.removeAllListeners();
  }
}
