/**
 * aztec-avm TypeScript client.
 *
 * Spawns the aztec-avm binary and communicates via Unix Domain Socket IPC.
 * Implements IMsgpackBackendAsync so it can be used with the generated AvmAsyncApi.
 */

import { spawn, ChildProcess } from 'child_process';
import { UdsIpcClient } from '@aztec/ipc-runtime';
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
 */
export class AvmBackend implements IMsgpackBackendAsync {
  private process: ChildProcess;
  private client: UdsIpcClient | null = null;
  private socketPath: string;
  private connectionPromise: Promise<void>;
  private connectionTimeout: NodeJS.Timeout | null = null;
  /** Resolves when the child process exits (for clean destroy). */
  private processExitPromise: Promise<void>;

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
      this.client?.destroy().catch(() => {});
      connectionReject?.(new Error(msg));
    });

    this.processExitPromise = new Promise<void>(resolve => {
      this.process.on('exit', (code: number | null) => {
        const msg = `aztec-avm process exited with code ${code}\nstderr: ${stderrOutput}`;
        this.client?.destroy().catch(() => {});
        connectionReject?.(new Error(msg));
        resolve();
      });
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
    UdsIpcClient.connect(this.socketPath)
      .then(client => {
        this.client = client;
        resolve();
      })
      .catch(reject);
  }

  async call(inputBuffer: Uint8Array): Promise<Uint8Array> {
    await this.connectionPromise;
    return await this.client!.call(inputBuffer);
  }

  /**
   * Cancel the current simulation by sending SIGUSR1 to the AVM process.
   * The C++ side has a signal handler that sets the CancellationToken,
   * causing the simulation to throw CancelledException at the next opcode check.
   * The process stays alive and is reusable for subsequent simulations.
   */
  async cancel(): Promise<void> {
    if (this.process && this.process.exitCode === null) {
      this.process.kill('SIGUSR1');
    }
  }

  async destroy(): Promise<void> {
    // Suppress any pending connection promise rejection to avoid unhandled rejections
    // when destroying before the IPC connection is established.
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

    // Clean up stdio streams and remove all listeners to allow the event loop to exit.
    if (this.process) {
      this.process.stdout?.destroy();
      this.process.stderr?.destroy();
      this.process.removeAllListeners();
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
