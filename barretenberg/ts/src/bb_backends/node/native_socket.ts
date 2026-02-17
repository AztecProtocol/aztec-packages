import { spawn, ChildProcess } from 'child_process';
import * as net from 'net';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
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
 */
export class BarretenbergNativeSocketAsyncBackend implements IMsgpackBackendAsync {
  private process: ChildProcess;
  private socket: net.Socket | null = null;
  private socketPath: string;
  private connectionPromise: Promise<void>;
  private connectionTimeout: NodeJS.Timeout | null = null;

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

  constructor(bbBinaryPath: string, threads?: number, logger?: (msg: string) => void) {
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
    }

    this.process.on('error', err => {
      if (connectionReject) {
        connectionReject(new Error(`Native backend process error: ${err.message}`));
        connectionReject = null;
        connectionResolve = null;
      }
      // Reject all pending callbacks
      const error = new Error(`Native backend process error: ${err.message}`);
      for (const callback of this.pendingCallbacks) {
        callback.reject(error);
      }
      this.pendingCallbacks = [];
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
      // Reject all pending callbacks
      const error = new Error(errorMsg);
      for (const callback of this.pendingCallbacks) {
        callback.reject(error);
      }
      this.pendingCallbacks = [];
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
        // Reject all pending callbacks
        const error = new Error(`Socket error: ${err.message}`);
        for (const callback of this.pendingCallbacks) {
          callback.reject(error);
        }
        this.pendingCallbacks = [];
      });

      this.socket.on('end', () => {
        // Reject all pending callbacks
        const error = new Error('Socket connection ended unexpectedly');
        for (const callback of this.pendingCallbacks) {
          callback.reject(error);
        }
        this.pendingCallbacks = [];
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

  async call(inputBuffer: Uint8Array): Promise<Uint8Array> {
    // Wait for connection to be established
    await this.connectionPromise;

    if (!this.socket) {
      throw new Error('Socket not connected');
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

  private cleanup(): void {
    // Reject any remaining pending callbacks
    const error = new Error('Backend connection closed');
    for (const callback of this.pendingCallbacks) {
      callback.reject(error);
    }
    this.pendingCallbacks = [];

    try {
      // Remove all event listeners to prevent hanging
      if (this.socket) {
        this.socket.removeAllListeners();
        // Unref so socket doesn't keep event loop alive
        // this.socket.unref();
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
    // this.process.unref();

    // Don't try to unlink socket - bb owns it and will clean it up
  }

  async destroy(): Promise<void> {
    this.cleanup();
    this.process.kill('SIGTERM');
    this.process.removeAllListeners();
  }
}
