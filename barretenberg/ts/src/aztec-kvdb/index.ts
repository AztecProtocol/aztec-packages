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
import { NapiShmAsyncClient, UdsIpcClient, createNapiShmAsyncClient } from '@aztec/ipc-runtime';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { IMsgpackBackendAsync } from '../bb_backends/interface.js';
import { findKvdbBinary } from '../bb_backends/node/platform.js';
import { threadId } from 'worker_threads';

let instanceCounter = 0;

export interface KvdbOptions {
  /** Custom path to the aztec-kvdb binary (overrides automatic detection). */
  kvdbPath?: string;
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

export { AsyncApi } from './generated/async.js';
export * from './generated/api_types.js';

/**
 * IPC backend that communicates with the aztec-kvdb binary.
 * Supports both Unix Domain Socket and shared memory transports.
 */
export class KvdbBackend implements IMsgpackBackendAsync {
  private process: ChildProcess;
  private client: UdsIpcClient | NapiShmAsyncClient | null = null;
  private inputPath: string;
  private useShm: boolean;
  private connectionPromise: Promise<void>;
  private connectionTimeout: NodeJS.Timeout | null = null;
  /** Resolves when the child process exits (for clean destroy). */
  private processExitPromise: Promise<void>;

  constructor(options: KvdbOptions) {
    const binaryPath = findKvdbBinary(options.kvdbPath);
    if (!binaryPath) {
      throw new Error('aztec-kvdb binary not found; rebuild bb.js with copy_native.sh');
    }

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

    this.process = spawn(binaryPath, args, {
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
      this.client?.destroy().catch(() => {});
      connectionReject?.(err);
    });

    this.processExitPromise = new Promise<void>(resolve => {
      this.process.on('exit', (code: number | null) => {
        this.client?.destroy().catch(() => {});
        resolve();
      });
    });

    if (this.useShm) {
      this.connectShm(connectionResolve!, connectionReject!, options.napiPath);
    } else {
      this.connectUdsPoll(connectionResolve!, connectionReject!);
    }
  }

  static async new(options: KvdbOptions): Promise<KvdbBackend> {
    const backend = new KvdbBackend(options);
    await backend.waitUntilReady();
    return backend;
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
    const clientOptions = napiPath ? { clientId: 0, customAddonPath: napiPath } : { clientId: 0 };

    const retryInterval = 100;
    const maxAttempts = 100; // 10s total
    let attempt = 0;

    const tryConnect = () => {
      attempt++;
      try {
        this.client = createNapiShmAsyncClient(shmName, clientOptions);
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
    UdsIpcClient.connect(this.inputPath)
      .then(client => {
        this.client = client;
        resolve();
      })
      .catch(reject);
  }

  // ——— Unified call/destroy ———

  async call(inputBuffer: Uint8Array): Promise<Uint8Array> {
    await this.connectionPromise;
    return await this.client!.call(inputBuffer);
  }

  async destroy(): Promise<void> {
    this.connectionPromise?.catch(() => {});

    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }

    if (this.client) {
      await this.client.destroy();
      this.client = null;
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
