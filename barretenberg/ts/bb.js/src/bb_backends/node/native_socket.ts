import { ChildProcess, spawn } from 'child_process';
import { once } from 'events';
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import readline from 'readline';
import { threadId } from 'worker_threads';

import { BackendUnavailableError } from '../errors.js';
import { IMsgpackBackendAsync } from '../interface.js';

let instanceCounter = 0;

// Backstop for a bb process that is alive but wedged before listen(). Deliberately generous:
// on a fully loaded prover many bb processes can spawn simultaneously and startup time has no
// useful upper bound, so this must only ever fire when bb is genuinely stuck, never under load.
const STARTUP_TIMEOUT_MS = 60_000;

/** What it takes to start a bb process, kept so a dead one can be replaced by an identical one. */
interface SpawnOptions {
  bbBinaryPath: string;
  threads?: number;
  logger?: (msg: string) => void;
  unref?: boolean;
  /**
   * Replace the bb process when it dies, on the next call. Only safe where a bb process holds no
   * state between calls: a replacement has no Chonk accumulation and no batch-verifier session.
   * Off by default, so a caller that does hold such state keeps failing loudly instead of
   * silently continuing against a fresh process.
   */
  respawn?: boolean;
}

/** A bb process and the connection to it. Replaced as a unit. */
interface Incarnation {
  proc: ChildProcess;
  socket: net.Socket;
  /** Kept so the path can be removed when the process is gone without having unlinked it. */
  socketPath: string;
}

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

  private proc: ChildProcess | null = null;
  /** Set when the process died; cleared when a replacement is adopted. */
  private death: Error | null = null;
  /** Shared by every caller that finds the connection down, so one death causes one replacement. */
  private starting: Promise<void> | null = null;
  private destroyed = false;

  private constructor(private opts: SpawnOptions) {
    this.socket = null;
    this.logger = opts.logger ?? (() => {});
  }

  private logger: (msg: string) => void;

  /** Take ownership of a started process and its connection, and watch for its death. */
  private adopt(incarnation: Incarnation): void {
    this.proc = incarnation.proc;
    this.socket = incarnation.socket;
    this.death = null;
    this.readingLength = true;
    this.lengthBytesRead = 0;
    this.responseBuffer = null;
    this.responseBytesRead = 0;

    const { proc, socket } = incarnation;
    // Every listener is scoped to this incarnation and removed with it, so a death observed after
    // a replacement was adopted cannot tear the replacement down.
    proc.on('error', err => {
      this.onDeath(incarnation, `Native backend process error: ${err.message}`);
    });

    proc.on('exit', (code, signal) => {
      const reason =
        code !== null && code !== 0
          ? `Native backend process exited with code ${code}`
          : signal && signal !== 'SIGTERM'
            ? `Native backend process killed with signal ${signal}`
            : 'Native backend process exited unexpectedly';
      this.onDeath(incarnation, reason);
    });

    socket.on('data', (chunk: Buffer) => {
      this.handleData(chunk);
    });

    socket.on('error', err => {
      this.onDeath(incarnation, `Socket error: ${err.message}`);
    });

    socket.on('end', () => {
      this.onDeath(incarnation, 'Socket connection ended unexpectedly');
    });
  }

  /**
   * This backend has lost the bb process it was talking to. In-flight calls fail as retryable, and
   * the connection is dropped so the next call either starts a replacement or reports the death.
   *
   * Losing the connection does not mean the process is gone: bb's server keeps serving after a
   * client disconnects, so it is killed here rather than left to outlive the backend that spawned
   * it. Killing a process that has already exited is a no-op.
   */
  private onDeath(incarnation: Incarnation, reason: string): void {
    if (this.proc !== incarnation.proc) {
      return; // A later incarnation is already in charge.
    }
    this.death = new BackendUnavailableError(reason);
    this.proc = null;
    retire(incarnation);
    this.failAllPending(this.death);
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
    respawn?: boolean,
  ): Promise<BarretenbergNativeSocketAsyncBackend> {
    const opts: SpawnOptions = { bbBinaryPath, threads, logger, unref, respawn };
    const backend = new BarretenbergNativeSocketAsyncBackend(opts);
    backend.adopt(await this.start(opts));
    return backend;
  }

  /** Start a bb process and connect to it. The whole of what a replacement has to repeat. */
  private static async start(opts: SpawnOptions): Promise<Incarnation> {
    const { bbBinaryPath, threads, logger, unref } = opts;
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
      // A missing or non-executable binary is a configuration fault: retrying cannot fix it.
      const code = (err as NodeJS.ErrnoException).code;
      const message = `Native backend process error: ${(err as Error).message}`;
      throw code === 'ENOENT' || code === 'EACCES' ? new Error(message) : new BackendUnavailableError(message);
    }

    try {
      const socket = await this.waitForSocketAndConnect(socketPath, proc);
      return { proc, socket, socketPath };
    } catch (err) {
      proc.kill('SIGKILL');
      cleanUpSocketPath(socketPath);
      // A bb that died starting up, never accepted a connection, or refused one failed for
      // environmental reasons — a loaded machine, memory pressure — so it is worth another try.
      throw new BackendUnavailableError((err as Error).message, { cause: err });
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

  /** Whether a call can be made without first starting a replacement bb process. */
  isConnected(): boolean {
    return this.socket !== null;
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
            this.logger('Received response but no pending callback');
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

  async call(inputBuffer: Uint8Array): Promise<Uint8Array> {
    const socket = await this.ensureConnected();

    return new Promise((resolve, reject) => {
      // If this is the first pending callback, ref the socket to keep event loop alive
      if (this.pendingCallbacks.length === 0) {
        socket.ref();
      }

      // Enqueue this promise's callbacks (FIFO order)
      this.pendingCallbacks.push({ resolve, reject });

      // Write request: 4-byte little-endian length + msgpack data
      // Socket will buffer these if needed, maintaining order
      const lengthBuf = Buffer.alloc(4);
      lengthBuf.writeUInt32LE(inputBuffer.length, 0);
      socket.write(lengthBuf);
      socket.write(inputBuffer);
    });
  }

  /**
   * The connection to use for the next call, replacing a dead bb process when that is allowed.
   * Concurrent callers share one replacement, so a single death costs a single process.
   */
  private async ensureConnected(): Promise<net.Socket> {
    if (this.socket) {
      return this.socket;
    }
    if (this.destroyed) {
      throw new Error('Backend connection closed');
    }
    if (!this.opts.respawn) {
      // A fresh error each time: callers attach to what they are given, and one shared instance
      // would carry one caller's stack and annotations to every other.
      const death = this.death;
      throw death
        ? new BackendUnavailableError(death.message, { cause: death })
        : new BackendUnavailableError('Socket not connected');
    }
    this.starting ??= this.replace().finally(() => {
      this.starting = null;
    });
    await this.starting;
    // destroy() may have run while the replacement was starting.
    if (!this.socket) {
      throw new Error('Backend connection closed');
    }
    return this.socket;
  }

  private async replace(): Promise<void> {
    this.logger('bb process died; starting a replacement');
    const incarnation = await BarretenbergNativeSocketAsyncBackend.start(this.opts);
    if (this.destroyed) {
      // destroy() ran while this was starting: the owner is gone, so neither is this process.
      retire(incarnation);
      throw new Error('Backend connection closed');
    }
    this.adopt(incarnation);
  }

  destroy(): Promise<void> {
    this.destroyed = true;
    this.failAllPending(new Error('Backend connection closed'));
    // A replacement still starting is not waited for: replace() kills whatever it produces once it
    // sees the backend destroyed. Waiting here would hold up shutdown for as long as a bb can take
    // to come up, which has no useful upper bound.
    const proc = this.proc;
    this.proc = null;
    // bb unlinks its own socket path when it shuts down cleanly, which SIGTERM gives it a chance to.
    proc?.kill('SIGTERM');
    proc?.removeAllListeners();
    return Promise.resolve();
  }
}

/**
 * Stop watching an incarnation, drop its connection and kill its process.
 *
 * A bb killed this way never gets to unlink its socket path, so this does it instead; otherwise a
 * long-lived backend that replaces its process leaves one file in the temp directory per death.
 */
function retire(incarnation: Incarnation): void {
  incarnation.proc.removeAllListeners();
  incarnation.socket.removeAllListeners();
  incarnation.socket.destroy();
  incarnation.proc.kill('SIGKILL');
  const socketPath = incarnation.socketPath;
  incarnation.proc.once('exit', () => cleanUpSocketPath(socketPath));
  cleanUpSocketPath(socketPath);
}

/** Remove a socket path a bb process is no longer listening on. */
function cleanUpSocketPath(socketPath: string): void {
  try {
    fs.unlinkSync(socketPath);
  } catch {
    // Already gone, which is the usual case: bb unlinks its own path when it exits cleanly.
  }
}
