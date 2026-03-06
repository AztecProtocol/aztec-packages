import { spawn, ChildProcess } from 'child_process';
import * as net from 'net';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Decoder, Encoder } from 'msgpackr';
import { IMsgpackBackendAsync } from '../interface.js';
import readline from 'readline';
import { threadId } from 'worker_threads';

let instanceCounter = 0;

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
 *
 * Supports two response formats:
 * - Legacy: msgpack CommandResponse (matched by FIFO order)
 * - Async: msgpack [request_id, CommandResponse] (matched by request_id)
 */
export class BarretenbergNativeSocketAsyncBackend implements IMsgpackBackendAsync {
  private process: ChildProcess;
  private socket: net.Socket | null = null;
  private socketPath: string;
  private connectionPromise: Promise<void>;
  private connectionTimeout: NodeJS.Timeout | null = null;

  // FIFO queue for legacy sync responses (request_id == 0)
  private pendingCallbacks: Array<{
    resolve: (data: Uint8Array) => void;
    reject: (error: Error) => void;
  }> = [];

  // Map for async responses (request_id > 0)
  private asyncCallbacks: Map<
    number,
    {
      resolve: (data: Uint8Array) => void;
      reject: (error: Error) => void;
    }
  > = new Map();

  // Monotonically increasing request ID counter for async calls
  private nextRequestId: number = 1;

  // State machine for reading responses
  private readingLength: boolean = true;
  private lengthBuffer: Buffer = Buffer.alloc(4);
  private lengthBytesRead: number = 0;
  private responseLength: number = 0;
  private responseBuffer: Buffer | null = null;
  private responseBytesRead: number = 0;

  // Shared codec instances
  private decoder: Decoder = new Decoder({ useRecords: false });
  private encoder: Encoder = new Encoder({ useRecords: false });

  constructor(bbBinaryPath: string, threads?: number, logger?: (msg: string) => void, unref?: boolean) {
    // Create a unique socket path in temp directory
    this.socketPath = path.join(os.tmpdir(), `bb-${process.pid}-${threadId}-${instanceCounter++}.sock`);

    // Ensure socket path doesn't already exist (cleanup from previous crashes)
    if (fs.existsSync(this.socketPath)) {
      fs.unlinkSync(this.socketPath);
    }

    let connectionResolve: (() => void) | null = null;
    let connectionReject: ((error: Error) => void) | null = null;

    this.connectionPromise = new Promise<void>((resolve, reject) => {
      connectionResolve = resolve;
      connectionReject = reject;
    });

    // If threads not set use num cpu cores, max 16.
    const hwc = threads ? threads.toString() : Math.min(16, os.cpus().length).toString();
    const env = { ...process.env, HARDWARE_CONCURRENCY: hwc };

    // Spawn bb process - it will create the socket server
    const args = ['msgpack', 'run', '--input', this.socketPath];
    this.process = spawn(bbBinaryPath, args, {
      stdio: ['ignore', logger ? 'pipe' : 'ignore', logger ? 'pipe' : 'ignore'],
      env,
    });

    // Disconnect from event loop so process can exit without waiting for bb
    // The bb process has parent death monitoring (prctl on Linux, kqueue on macOS)
    // so it will automatically exit when Node.js exits
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

    this.process.on('error', err => {
      if (connectionReject) {
        connectionReject(new Error(`Native backend process error: ${err.message}`));
        connectionReject = null;
        connectionResolve = null;
      }
      this.rejectAll(new Error(`Native backend process error: ${err.message}`));
    });

    this.process.on('exit', (code, signal) => {
      const errorMsg =
        code !== null && code !== 0
          ? `Native backend process exited with code ${code}`
          : signal && signal !== 'SIGTERM'
            ? `Native backend process killed with signal ${signal}`
            : 'Native backend process exited unexpectedly';

      if (connectionReject) {
        connectionReject(new Error(errorMsg));
        connectionReject = null;
        connectionResolve = null;
      }
      this.rejectAll(new Error(errorMsg));
    });

    // Wait for bb to create socket file, then connect
    this.waitForSocketAndConnect()
      .then(() => {
        if (connectionResolve) {
          connectionResolve();
          connectionResolve = null;
          connectionReject = null;
        }
      })
      .catch(err => {
        if (connectionReject) {
          connectionReject(err);
          connectionReject = null;
          connectionResolve = null;
        }
      });

    // Set a timeout for connection
    this.connectionTimeout = setTimeout(() => {
      if (connectionReject) {
        connectionReject(new Error('Timeout waiting for bb socket connection'));
        connectionReject = null;
        connectionResolve = null;
        this.cleanup();
      }
    }, 5000);
  }

  private async waitForSocketAndConnect(): Promise<void> {
    // Poll for socket file to exist (bb is creating it)
    const startTime = Date.now();
    while (!fs.existsSync(this.socketPath)) {
      if (Date.now() - startTime > 5000) {
        throw new Error('Timeout waiting for bb to create socket file');
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Additional check: ensure it's actually a socket
    const stats = fs.statSync(this.socketPath);
    if (!stats.isSocket()) {
      throw new Error(`Path exists but is not a socket: ${this.socketPath}`);
    }

    // Connect to bb's socket server as a client
    return new Promise<void>((resolve, reject) => {
      this.socket = net.connect(this.socketPath);

      // Disable Nagle's algorithm for lower latency
      this.socket.setNoDelay(true);

      // Set up event handlers
      this.socket.once('connect', () => {
        // Socket starts referenced - will be unreferenced when no callbacks pending

        // Clear connection timeout on successful connection
        if (this.connectionTimeout) {
          clearTimeout(this.connectionTimeout);
          this.connectionTimeout = null;
        }
        resolve();
      });

      this.socket.once('error', err => {
        reject(new Error(`Failed to connect to bb socket: ${err.message}`));
      });

      // Set up data handler after connection is established
      this.socket.on('data', (chunk: Buffer) => {
        this.handleData(chunk);
      });

      // Handle ongoing errors after initial connection
      this.socket.on('error', err => {
        this.rejectAll(new Error(`Socket error: ${err.message}`));
      });

      this.socket.on('end', () => {
        this.rejectAll(new Error('Socket connection ended unexpectedly'));
      });
    });
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
          this.dispatchResponse(new Uint8Array(this.responseBuffer!));

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

  /**
   * Route a complete response to the correct callback.
   *
   * Async protocol responses are [request_id, CommandResponse] — a 2-element array
   * where the first element is a positive integer. Legacy responses are CommandResponse
   * directly (a NamedUnion serialized as [string, payload]).
   */
  private dispatchResponse(data: Uint8Array): void {
    // Try to detect async response format: [request_id, CommandResponse]
    // We peek at the msgpack structure to check if it's a 2-element array
    // where the first element is a positive integer (request_id > 0)
    try {
      const decoded = this.decoder.unpack(data);
      if (Array.isArray(decoded) && decoded.length === 2 && typeof decoded[0] === 'number' && decoded[0] > 0) {
        // Async response — route by request_id
        const requestId = decoded[0] as number;
        const callback = this.asyncCallbacks.get(requestId);
        if (callback) {
          this.asyncCallbacks.delete(requestId);
          // Re-encode just the inner CommandResponse for the caller
          const innerBuffer = this.encoder.pack(decoded[1]);
          callback.resolve(new Uint8Array(innerBuffer));
        } else {
          console.warn(`Received async response for unknown request_id ${requestId}`);
        }
        this.maybeUnrefSocket();
        return;
      }
    } catch {
      // Failed to decode — fall through to legacy FIFO handling
    }

    // Legacy FIFO response
    const callback = this.pendingCallbacks.shift();
    if (callback) {
      callback.resolve(data);
    } else {
      console.warn('Received response but no pending callback');
    }
    this.maybeUnrefSocket();
  }

  /** Unref socket when no callbacks are pending (allows process to exit). */
  private maybeUnrefSocket(): void {
    if (this.pendingCallbacks.length === 0 && this.asyncCallbacks.size === 0 && this.socket) {
      this.socket.unref();
    }
  }

  /** Ref socket to keep event loop alive while callbacks are pending. */
  private maybeRefSocket(): void {
    if (this.pendingCallbacks.length === 0 && this.asyncCallbacks.size === 0 && this.socket) {
      this.socket.ref();
    }
  }

  /**
   * Send a synchronous (FIFO) msgpack request.
   * Response is matched by order — the next response from bb resolves this call.
   */
  async call(inputBuffer: Uint8Array): Promise<Uint8Array> {
    await this.connectionPromise;

    if (!this.socket) {
      throw new Error('Socket not connected');
    }

    return new Promise((resolve, reject) => {
      this.maybeRefSocket();
      this.pendingCallbacks.push({ resolve, reject });
      this.sendRaw(inputBuffer);
    });
  }

  /**
   * Send an async msgpack request with a request_id.
   * Response is matched by request_id and may arrive out of order.
   *
   * The request is wrapped as [request_id, Command] before sending.
   * Returns both the request_id (for tracking) and a promise for the response.
   */
  async callAsync(inputBuffer: Uint8Array): Promise<{ requestId: number; response: Promise<Uint8Array> }> {
    await this.connectionPromise;

    if (!this.socket) {
      throw new Error('Socket not connected');
    }

    const requestId = this.nextRequestId++;

    // Wrap the command: the input is already [Command], we need [request_id, Command]
    // The input comes as msgpack-encoded [Command], so we decode, wrap, re-encode
    const decoded = this.decoder.unpack(inputBuffer);
    if (!Array.isArray(decoded) || decoded.length !== 1) {
      throw new Error('Expected input to be a 1-element array [Command]');
    }
    const wrappedBuffer = this.encoder.pack([requestId, decoded[0]]);

    const response = new Promise<Uint8Array>((resolve, reject) => {
      this.maybeRefSocket();
      this.asyncCallbacks.set(requestId, { resolve, reject });
      this.sendRaw(new Uint8Array(wrappedBuffer));
    });

    return { requestId, response };
  }

  /** Write length-prefixed data to the socket. */
  private sendRaw(data: Uint8Array): void {
    const lengthBuf = Buffer.alloc(4);
    lengthBuf.writeUInt32LE(data.length, 0);
    this.socket!.write(lengthBuf);
    this.socket!.write(data);
  }

  /** Reject all pending callbacks (both FIFO and async). */
  private rejectAll(error: Error): void {
    for (const callback of this.pendingCallbacks) {
      callback.reject(error);
    }
    this.pendingCallbacks = [];

    for (const [, callback] of this.asyncCallbacks) {
      callback.reject(error);
    }
    this.asyncCallbacks.clear();
  }

  private cleanup(): void {
    this.rejectAll(new Error('Backend connection closed'));

    try {
      if (this.socket) {
        this.socket.removeAllListeners();
        this.socket.destroy();
      }
    } catch (e) {
      // Ignore errors during cleanup
    }

    // Clear connection timeout if still pending
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }

    // Remove process event listeners and unref to not block event loop
    this.process.removeAllListeners();

    // Don't try to unlink socket - bb owns it and will clean it up
  }

  async destroy(): Promise<void> {
    this.cleanup();
    this.process.kill('SIGTERM');
    this.process.removeAllListeners();
  }
}
