/**
 * aztec-avm TypeScript client.
 *
 * Spawns the aztec-avm binary and communicates via Unix Domain Socket IPC.
 * Implements IMsgpackBackendAsync so it can be used with the generated AvmAsyncApi.
 */

import { spawn, ChildProcess } from 'child_process';
import * as net from 'net';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { IMsgpackBackendAsync } from '../bb_backends/interface.js';
import { threadId } from 'worker_threads';

let instanceCounter = 0;

export interface AvmOptions {
  /** Path to the aztec-avm binary */
  binaryPath: string;
  /** Socket path for the running aztec-wsdb server */
  wsdbSocketPath: string;
  /** Socket path for the running aztec-cdb server */
  cdbSocketPath: string;
  /** Optional logger function */
  logger?: (msg: string) => void;
}

/**
 * IPC backend that communicates with the aztec-avm binary via Unix Domain Socket.
 *
 * Protocol: 4-byte little-endian length prefix + msgpack buffer.
 */
export class AvmBackend implements IMsgpackBackendAsync {
  private process: ChildProcess;
  private socket: net.Socket | null = null;
  private socketPath: string;
  private connectionPromise: Promise<void>;
  private connectionTimeout: NodeJS.Timeout | null = null;

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

  constructor(options: AvmOptions) {
    this.socketPath = path.join(os.tmpdir(), `avm-${process.pid}-${threadId}-${instanceCounter++}.sock`);

    if (fs.existsSync(this.socketPath)) {
      fs.unlinkSync(this.socketPath);
    }

    let connectionResolve: (() => void) | null = null;
    let connectionReject: ((error: Error) => void) | null = null;

    this.connectionPromise = new Promise<void>((resolve, reject) => {
      connectionResolve = resolve;
      connectionReject = reject;
    });

    // Build CLI args
    const args = [
      'msgpack',
      'run',
      '--input',
      this.socketPath,
      '--wsdb',
      options.wsdbSocketPath,
      '--cdb',
      options.cdbSocketPath,
    ];

    this.process = spawn(options.binaryPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.process.unref();

    // Always capture stderr for error diagnostics; optionally forward via logger
    let stderrOutput = '';
    if (this.process.stdout) {
      this.process.stdout.on('data', (data: Buffer) => {
        options.logger?.(`[avm stdout] ${data.toString().trimEnd()}`);
      });
    }
    if (this.process.stderr) {
      this.process.stderr.on('data', (data: Buffer) => {
        const text = data.toString().trimEnd();
        stderrOutput += text + '\n';
        options.logger?.(`[avm stderr] ${text}`);
      });
    }

    this.process.on('error', (err: Error) => {
      const msg = `aztec-avm process error: ${err.message}\nstderr: ${stderrOutput}`;
      for (const cb of this.pendingCallbacks) {
        cb.reject(new Error(msg));
      }
      this.pendingCallbacks = [];
      connectionReject?.(new Error(msg));
    });

    this.process.on('exit', (code: number | null) => {
      const msg = `aztec-avm process exited with code ${code}\nstderr: ${stderrOutput}`;
      for (const cb of this.pendingCallbacks) {
        cb.reject(new Error(msg));
      }
      this.pendingCallbacks = [];
      connectionReject?.(new Error(msg));
    });

    // Poll for socket file
    const pollInterval = 50;
    const maxWait = 10000;
    let waited = 0;

    const poll = () => {
      if (fs.existsSync(this.socketPath)) {
        this.connect(connectionResolve!, connectionReject!);
      } else if (waited >= maxWait) {
        connectionReject?.(
          new Error(
            `Timeout waiting for aztec-avm socket at ${this.socketPath}\nbinary: ${options.binaryPath}\nstderr: ${stderrOutput || '(empty)'}`,
          ),
        );
      } else {
        waited += pollInterval;
        this.connectionTimeout = setTimeout(poll, pollInterval);
      }
    };

    this.connectionTimeout = setTimeout(poll, pollInterval);
  }

  /** Returns the socket path for the running AVM server. */
  getSocketPath(): string {
    return this.socketPath;
  }

  private connect(resolve: () => void, reject: (error: Error) => void) {
    this.socket = net.createConnection(this.socketPath);

    this.socket.on('connect', () => {
      this.socket!.unref();
      resolve();
    });

    this.socket.on('error', (err: Error) => {
      reject(err);
      for (const cb of this.pendingCallbacks) {
        cb.reject(err);
      }
      this.pendingCallbacks = [];
    });

    this.socket.on('data', (chunk: Buffer) => {
      this.handleData(chunk);
    });

    this.socket.on('close', () => {
      const error = new Error('aztec-avm socket closed');
      for (const cb of this.pendingCallbacks) {
        cb.reject(error);
      }
      this.pendingCallbacks = [];
    });
  }

  private handleData(chunk: Buffer) {
    let offset = 0;

    while (offset < chunk.length) {
      if (this.readingLength) {
        const bytesNeeded = 4 - this.lengthBytesRead;
        const bytesAvailable = chunk.length - offset;
        const bytesToCopy = Math.min(bytesNeeded, bytesAvailable);

        chunk.copy(this.lengthBuffer, this.lengthBytesRead, offset, offset + bytesToCopy);
        this.lengthBytesRead += bytesToCopy;
        offset += bytesToCopy;

        if (this.lengthBytesRead === 4) {
          this.responseLength = this.lengthBuffer.readUInt32LE(0);
          this.responseBuffer = Buffer.alloc(this.responseLength);
          this.responseBytesRead = 0;
          this.readingLength = false;
        }
      } else {
        const bytesNeeded = this.responseLength - this.responseBytesRead;
        const bytesAvailable = chunk.length - offset;
        const bytesToCopy = Math.min(bytesNeeded, bytesAvailable);

        chunk.copy(this.responseBuffer!, this.responseBytesRead, offset, offset + bytesToCopy);
        this.responseBytesRead += bytesToCopy;
        offset += bytesToCopy;

        if (this.responseBytesRead === this.responseLength) {
          const callback = this.pendingCallbacks.shift();
          if (callback) {
            callback.resolve(new Uint8Array(this.responseBuffer!));
          }

          // Reset state for next message
          this.readingLength = true;
          this.lengthBytesRead = 0;
          this.responseBuffer = null;
        }
      }
    }
  }

  async call(inputBuffer: Uint8Array): Promise<Uint8Array> {
    await this.connectionPromise;

    return new Promise<Uint8Array>((resolve, reject) => {
      this.pendingCallbacks.push({ resolve, reject });

      // Write length prefix (4 bytes, little-endian) + data
      const lengthBuf = Buffer.alloc(4);
      lengthBuf.writeUInt32LE(inputBuffer.length, 0);

      this.socket!.ref();
      this.socket!.write(lengthBuf);
      this.socket!.write(Buffer.from(inputBuffer));
    });
  }

  /**
   * Cancel the current simulation.
   *
   * We intentionally do NOT kill the AVM process here. The process is long-lived
   * and shared across block builds. Killing it would make it unavailable for
   * subsequent blocks. Instead, the in-flight simulation completes in the background
   * and its response is received by the pending callback (which the caller has
   * already abandoned due to timeout). The fork's checkpoints are reverted by
   * the caller, so the AVM's writes are discarded.
   *
   * TODO(#IPC): Add an AvmCancel IPC command that sets the C++ CancellationToken
   * to abort the simulation early without killing the process.
   */
  async cancel(): Promise<void> {
    // No-op: let the simulation finish in the background.
  }

  async destroy(): Promise<void> {
    // Suppress any pending connection promise rejection to avoid unhandled rejections
    // when destroying before the IPC connection is established.
    this.connectionPromise?.catch(() => {});

    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }

    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }

    if (this.process && !this.process.killed) {
      const exitPromise = new Promise<void>(resolve => {
        this.process!.once('exit', () => resolve());
      });
      this.process.kill('SIGTERM');
      await exitPromise;
    }

    // Clean up socket file
    try {
      if (fs.existsSync(this.socketPath)) {
        fs.unlinkSync(this.socketPath);
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}
