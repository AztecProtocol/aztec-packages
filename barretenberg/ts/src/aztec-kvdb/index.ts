/**
 * aztec-kvdb TypeScript client.
 *
 * Spawns the aztec-kvdb binary and communicates via Unix Domain Socket or
 * shared memory IPC. Implements IMsgpackBackendAsync so it can be used with
 * the generated KvdbAsyncApi.
 *
 * Same shape as WsdbBackend; just a different binary and a smaller CLI surface.
 */

import { spawn, ChildProcess } from 'child_process';
import { createRequire } from 'module';
import * as net from 'net';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { IMsgpackBackendAsync } from '../bb_backends/interface.js';
import { findNapiBinary, findPackageRoot } from '../bb_backends/node/platform.js';
import { threadId } from 'worker_threads';

let instanceCounter = 0;

export interface KvdbOptions {
  /** Path to the aztec-kvdb binary */
  binaryPath: string;
  /** Data directory for the LMDB store */
  dataDir: string;
  /** LMDB map size in bytes (default: 1 MiB, matches the legacy NAPI wrapper) */
  mapSizeBytes?: number;
  /** LMDB max readers (default: 16) */
  maxReaders?: number;
  /** Optional logger function */
  logger?: (msg: string) => void;
  /** Use shared memory instead of UDS for IPC (lower latency). */
  useShm?: boolean;
  /** Path to NAPI binary (required when useShm=true, auto-detected if omitted). */
  napiPath?: string;
}

/** Build CLI args common to both UDS and SHM modes. */
function buildKvdbArgs(inputPath: string, options: KvdbOptions): string[] {
  const args = ['msgpack', 'run', '--input', inputPath, '--data-dir', options.dataDir];
  if (options.mapSizeBytes !== undefined) {
    args.push('--map-size', options.mapSizeBytes.toString());
  }
  if (options.maxReaders !== undefined) {
    args.push('--max-readers', options.maxReaders.toString());
  }
  return args;
}

// No codegen: the kvdb wire format is the same TypedMessage layout that the
// existing yarn-project/native MsgpackChannel already speaks. AztecLMDBStoreV2
// constructs a KvdbBackend and passes it to MsgpackChannel as the MessageReceiver,
// reusing yarn-project/kv-store/src/lmdb-v2/message.ts as the schema.

/**
 * IPC backend that communicates with the aztec-kvdb binary.
 * Supports both Unix Domain Socket and shared memory transports.
 */
export class KvdbBackend implements IMsgpackBackendAsync {
  private process: ChildProcess;
  /** For UDS mode */
  private socket: net.Socket | null = null;
  /** For SHM mode */
  private shmClient: any = null;
  private inputPath: string;
  private useShm: boolean;
  private connectionPromise: Promise<void>;
  private connectionTimeout: NodeJS.Timeout | null = null;
  /** Resolves when the child process exits (for clean destroy). */
  private processExitPromise: Promise<void>;

  private pendingCallbacks: Array<{
    resolve: (data: Uint8Array) => void;
    reject: (error: Error) => void;
  }> = [];

  // State machine for reading UDS responses
  private readingLength: boolean = true;
  private lengthBuffer: Buffer = Buffer.alloc(4);
  private lengthBytesRead: number = 0;
  private responseLength: number = 0;
  private responseBuffer: Buffer | null = null;
  private responseBytesRead: number = 0;

  constructor(options: KvdbOptions) {
    this.useShm = options.useShm ?? false;
    const instanceId = `kvdb-${process.pid}-${threadId}-${instanceCounter++}`;

    if (this.useShm) {
      this.inputPath = `${instanceId}.shm`;
    } else {
      this.inputPath = path.join(os.tmpdir(), `${instanceId}.sock`);
      if (fs.existsSync(this.inputPath)) {
        fs.unlinkSync(this.inputPath);
      }
    }

    let connectionResolve: (() => void) | null = null;
    let connectionReject: ((error: Error) => void) | null = null;
    this.connectionPromise = new Promise<void>((resolve, reject) => {
      connectionResolve = resolve;
      connectionReject = reject;
    });

    const args = buildKvdbArgs(this.inputPath, options);
    if (this.useShm) {
      args.push('--request-ring-size', `${1024 * 1024 * 4}`);
      args.push('--response-ring-size', `${1024 * 1024 * 4}`);
    }

    this.process = spawn(options.binaryPath, args, {
      stdio: ['ignore', options.logger ? 'pipe' : 'ignore', options.logger ? 'pipe' : 'ignore'],
    });

    if (options.logger) {
      const logger = options.logger;
      if (this.process.stdout) {
        this.process.stdout.on('data', (data: Buffer) => logger(`[kvdb stdout] ${data.toString().trimEnd()}`));
      }
      if (this.process.stderr) {
        this.process.stderr.on('data', (data: Buffer) => logger(`[kvdb stderr] ${data.toString().trimEnd()}`));
      }
    }

    this.process.on('error', (err: Error) => {
      for (const cb of this.pendingCallbacks) {
        cb.reject(new Error(`aztec-kvdb process error: ${err.message}`));
      }
      this.pendingCallbacks = [];
      connectionReject?.(err);
    });

    this.processExitPromise = new Promise<void>(resolve => {
      this.process.on('exit', (code: number | null) => {
        const error = new Error(`aztec-kvdb process exited with code ${code}`);
        for (const cb of this.pendingCallbacks) {
          cb.reject(error);
        }
        this.pendingCallbacks = [];
        resolve();
      });
    });

    if (this.useShm) {
      this.connectShm(connectionResolve!, connectionReject!, options.napiPath);
    } else {
      this.connectUdsPoll(connectionResolve!, connectionReject!);
    }
  }

  /** Returns the IPC path for the running kvdb server. */
  getSocketPath(): string {
    return this.inputPath;
  }

  /** Wait until the backend is connected and ready to accept commands. */
  waitUntilReady(): Promise<void> {
    return this.connectionPromise;
  }

  // ——— SHM connection ———

  private connectShm(resolve: () => void, reject: (error: Error) => void, napiPath?: string) {
    const shmName = this.inputPath.replace(/\.shm$/, '');
    const addonPath = findNapiBinary(napiPath);
    if (!addonPath) {
      reject(new Error('NAPI binary not found — required for shared memory mode'));
      return;
    }
    let addon: any;
    try {
      const require = createRequire(findPackageRoot()!);
      addon = require(addonPath);
    } catch (err: any) {
      reject(new Error(`Failed to load NAPI module for SHM: ${err.message}`));
      return;
    }

    const retryInterval = 100;
    const maxAttempts = 100; // 10s total
    let attempt = 0;

    const tryConnect = () => {
      attempt++;
      try {
        // Single TS client per kvdb subprocess.
        this.shmClient = new addon.MsgpackClientAsync(shmName, 0);
        this.shmClient.setResponseCallback((responseBuffer: Buffer) => {
          const callback = this.pendingCallbacks.shift();
          if (callback) {
            callback.resolve(new Uint8Array(responseBuffer));
          }
          if (this.pendingCallbacks.length === 0) {
            this.shmClient.release();
          }
        });
        resolve();
      } catch (e: any) {
        if (attempt >= maxAttempts) {
          reject(
            new Error(
              `Timeout connecting to kvdb shared memory after ${maxAttempts * retryInterval}ms: ${e?.message ?? e}`,
            ),
          );
        } else {
          this.connectionTimeout = setTimeout(tryConnect, retryInterval);
        }
      }
    };

    this.connectionTimeout = setTimeout(tryConnect, retryInterval);
  }

  // ——— UDS connection ———

  private connectUdsPoll(resolve: () => void, reject: (error: Error) => void) {
    const pollInterval = 50;
    const maxWait = 10000;
    let waited = 0;
    const poll = () => {
      if (fs.existsSync(this.inputPath)) {
        this.connectUds(resolve, reject);
      } else if (waited >= maxWait) {
        reject(new Error(`Timeout waiting for aztec-kvdb socket at ${this.inputPath}`));
      } else {
        waited += pollInterval;
        this.connectionTimeout = setTimeout(poll, pollInterval);
      }
    };
    this.connectionTimeout = setTimeout(poll, pollInterval);
  }

  private connectUds(resolve: () => void, reject: (error: Error) => void) {
    this.socket = net.createConnection(this.inputPath);

    this.socket.on('connect', () => resolve());

    this.socket.on('error', (err: Error) => {
      reject(err);
      for (const cb of this.pendingCallbacks) {
        cb.reject(err);
      }
      this.pendingCallbacks = [];
    });

    this.socket.on('data', (chunk: Buffer) => this.handleData(chunk));

    this.socket.on('close', () => {
      const error = new Error('aztec-kvdb socket closed');
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
          this.readingLength = true;
          this.lengthBytesRead = 0;
          this.responseBuffer = null;
        }
      }
    }
  }

  // ——— Unified call/destroy ———

  async call(inputBuffer: Uint8Array): Promise<Uint8Array> {
    await this.connectionPromise;
    if (this.useShm) {
      return new Promise<Uint8Array>((resolve, reject) => {
        if (this.pendingCallbacks.length === 0) {
          this.shmClient.acquire();
        }
        this.pendingCallbacks.push({ resolve, reject });
        try {
          this.shmClient.call(Buffer.from(inputBuffer));
        } catch (err: any) {
          this.pendingCallbacks.pop();
          if (this.pendingCallbacks.length === 0) {
            this.shmClient.release();
          }
          reject(new Error(`SHM call failed: ${err.message}`));
        }
      });
    }
    return new Promise<Uint8Array>((resolve, reject) => {
      this.pendingCallbacks.push({ resolve, reject });
      const lengthBuf = Buffer.alloc(4);
      lengthBuf.writeUInt32LE(inputBuffer.length, 0);
      this.socket!.write(lengthBuf);
      this.socket!.write(Buffer.from(inputBuffer));
    });
  }

  async destroy(): Promise<void> {
    this.connectionPromise?.catch(() => {});

    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }

    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }

    if (this.process && this.process.exitCode === null) {
      this.process.kill('SIGTERM');
    }
    await this.processExitPromise;

    if (this.process) {
      this.process.stdout?.destroy();
      this.process.stderr?.destroy();
      this.process.removeAllListeners();
    }

    try {
      if (!this.useShm && fs.existsSync(this.inputPath)) {
        fs.unlinkSync(this.inputPath);
      }
      if (this.useShm) {
        const shmName = this.inputPath.replace(/\.shm$/, '');
        for (const suffix of ['_request', '_response']) {
          const shmPath = `/dev/shm/${shmName}${suffix}`;
          if (fs.existsSync(shmPath)) {
            fs.unlinkSync(shmPath);
          }
        }
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}
