import { spawn, ChildProcess } from 'child_process';
import { openSync, closeSync } from 'fs';
import { createNapiShmAsyncClient, findIpcRuntimeNapi, type NapiShmAsyncClient } from '@aztec/ipc-runtime';
import { IMsgpackBackendAsync } from '../interface.js';
import { threadId } from 'worker_threads';

let instanceCounter = 0;

/**
 * Asynchronous shared memory backend that communicates with bb binary via shared memory.
 * Uses NAPI module with background thread polling for async operations.
 * Supports request pipelining - multiple requests can be in flight simultaneously.
 *
 * Architecture (matches socket backend pattern):
 * - bb acts as the SERVER, TypeScript is the CLIENT
 * - bb creates the shared memory region
 * - TypeScript connects through the ipc-runtime NAPI wrapper
 */
export class BarretenbergNativeShmAsyncBackend implements IMsgpackBackendAsync {
  private process: ChildProcess;
  private client: NapiShmAsyncClient;
  private logFd?: number; // File descriptor for logs

  private constructor(process: ChildProcess, client: NapiShmAsyncClient, logFd?: number) {
    this.process = process;
    this.client = client;
    this.logFd = logFd;
  }

  /**
   * Create and initialize an async shared memory backend.
   * @param bbBinaryPath Path to bb binary
   * @param threads Optional number of threads (defaults to min(32, num_cpus))
   * @param logger Optional logger function for bb output
   */
  static async new(
    bbBinaryPath: string,
    napiPath?: string,
    threads?: number,
    logger?: (msg: string) => void,
  ): Promise<BarretenbergNativeShmAsyncBackend> {
    const addonPath = findIpcRuntimeNapi(napiPath);
    if (!addonPath) {
      throw new Error('ipc-runtime NAPI binary not found — required for shared memory mode');
    }

    // Create a unique shared memory name
    const shmName = `bb-async-${process.pid}-${threadId}-${instanceCounter++}`;

    // If threads not set use num cpu cores, max 16 (same as socket backend)
    const hwc = threads ? threads.toString() : '16';
    const env = { ...process.env, HARDWARE_CONCURRENCY: hwc };

    // Set up file logging if logger is provided
    // Direct file redirection bypasses Node event loop - logs are written even if process hangs
    let logFd: number | undefined;
    let logPath: string | undefined;
    if (logger) {
      logPath = `/tmp/${shmName}.log`;
      logFd = openSync(logPath, 'w');
      logger(`BB process logs redirected to: ${logPath}`);
    }

    // Spawn bb process with shared memory mode
    // Use larger ring buffers for async mode to support pipelining
    const args = [
      'msgpack',
      'run',
      '--input',
      `${shmName}.shm`,
      '--request-ring-size',
      `${1024 * 1024 * 4}`,
      '--response-ring-size',
      `${1024 * 1024 * 4}`,
    ];
    const bbProcess = spawn(bbBinaryPath, args, {
      stdio: ['ignore', logFd ?? 'ignore', logFd ?? 'ignore'],
      env,
    });

    // Disconnect from event loop so process can exit without waiting for bb
    // The bb process has parent death monitoring (prctl on Linux, kqueue on macOS)
    // so it will automatically exit when Node.js exits
    bbProcess.unref();

    // Track if process has exited
    let processExited = false;
    let exitError: Error | null = null;

    bbProcess.on('error', err => {
      processExited = true;
      exitError = new Error(`Native backend process error: ${err.message}`);
    });

    bbProcess.on('exit', (code, signal) => {
      processExited = true;
      if (code !== null && code !== 0) {
        exitError = new Error(`Native backend process exited with code ${code}`);
      } else if (signal && signal !== 'SIGTERM') {
        exitError = new Error(`Native backend process killed with signal ${signal}`);
      }
    });

    // Wait for bb to create shared memory
    // Retry connection every 100ms for up to 5 seconds (longer than sync for thread startup)
    const retryInterval = 100; // ms
    const timeout = 5000; // ms
    const maxAttempts = Math.floor(timeout / retryInterval);
    let client: NapiShmAsyncClient | null = null;

    try {
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        // Check if bb process has exited before attempting connection
        if (processExited) {
          throw exitError || new Error('Native backend process exited unexpectedly during startup');
        }

        // Wait before attempting connection (except first attempt)
        if (attempt > 0) {
          await new Promise(resolve => setTimeout(resolve, retryInterval));
        }

        try {
          client = createNapiShmAsyncClient(shmName, { clientId: 0, customAddonPath: addonPath });
          break; // Success!
        } catch (err: any) {
          // Connection failed, will retry
          if (attempt === maxAttempts - 1) {
            // Last attempt failed - check one more time if process exited
            if (processExited && exitError) {
              throw exitError;
            }
            throw new Error(`Failed to connect to shared memory after ${timeout}ms: ${err.message}`);
          }
        }
      }

      if (!client) {
        throw new Error('Failed to create client connection');
      }

      return new BarretenbergNativeShmAsyncBackend(bbProcess, client, logFd);
    } finally {
      // If we failed to connect, ensure the process is killed and log file closed
      if (!client) {
        bbProcess.kill('SIGKILL');
        if (logFd !== undefined) {
          try {
            closeSync(logFd);
          } catch (e) {
            // Ignore errors during cleanup
          }
        }
      }
    }
  }

  async call(inputBuffer: Uint8Array): Promise<Uint8Array> {
    try {
      return await this.client.call(inputBuffer);
    } catch (err: any) {
      throw new Error(`Shared memory async call failed: ${err.message}`);
    }
  }

  async destroy(): Promise<void> {
    await this.client.destroy();
    this.process.kill('SIGTERM');
    this.process.removeAllListeners();

    // Close log file if open
    if (this.logFd !== undefined) {
      try {
        closeSync(this.logFd);
      } catch (e) {
        // Ignore errors during cleanup
      }
    }
  }
}
