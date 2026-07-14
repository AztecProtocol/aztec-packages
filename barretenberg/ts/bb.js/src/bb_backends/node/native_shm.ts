import { createRequire } from 'module';
import { spawn, ChildProcess } from 'child_process';
import { openSync, closeSync, unlinkSync } from 'fs';
import { IMsgpackBackendSync } from '../interface.js';
import { findNapiBinary, findPackageRoot } from './platform.js';
import { threadId } from 'worker_threads';

let instanceCounter = 0;

/**
 * Synchronous shared memory backend that communicates with bb binary via shared memory.
 * Uses NAPI module to interface with shared memory IPC.
 *
 * Architecture: bb acts as the SERVER, TypeScript is the CLIENT
 * - bb creates the shared memory region
 * - TypeScript connects via NAPI wrapper
 *
 * Protocol:
 * - Handled internally by IpcClient (no manual length prefixes needed)
 */
export class BarretenbergNativeShmSyncBackend implements IMsgpackBackendSync {
  private process: ChildProcess;
  private client: any; // NAPI MsgpackClient instance
  private logFd?: number; // File descriptor for logs

  private constructor(process: ChildProcess, client: any, logFd?: number) {
    this.process = process;
    this.client = client;
    this.logFd = logFd;
  }

  /**
   * Create and initialize a shared memory backend.
   * @param bbBinaryPath Path to bb binary
   * @param napiPath Path to NAPI binary
   * @param threads Optional number of threads
   */
  static async new(
    bbBinaryPath: string,
    napiPath: string,
    threads?: number,
    logger?: (msg: string) => void,
  ): Promise<BarretenbergNativeShmSyncBackend> {
    // Import the NAPI module
    // The addon is built to the nodejs_module directory
    const addonPath = findNapiBinary(napiPath);
    // Try loading
    let addon: any = null;
    try {
      const require = createRequire(findPackageRoot()!);
      addon = require(addonPath!);
    } catch (err) {
      // Addon not built yet or not available
      throw new Error('Shared memory sync NAPI not available.');
    }

    // Create a unique shared memory name
    const shmName = `bb-sync-${process.pid}-${threadId}-${instanceCounter++}`;

    // If threads not set use 1 thread. We're not expected to do long lived work on sync backends.
    const hwc = threads ? threads.toString() : '1';
    const env = { ...process.env, HARDWARE_CONCURRENCY: hwc };

    // Set up file logging if logger is provided.
    // Direct file redirection bypasses Node event loop - logs are written even if process hangs.
    let logFd: number | undefined;
    let logPath: string | undefined;
    if (logger) {
      logPath = `/tmp/${shmName}.log`;
      logFd = openSync(logPath, 'w');
      logger(`BB process logs redirected to: ${logPath}`);
    }

    // Clean up any stale shared memory files from previous runs
    // This handles the case where a previous process crashed without cleanup
    const shmRequestPath = `/dev/shm/${shmName}_request`;
    const shmResponsePath = `/dev/shm/${shmName}_response`;
    try {
      unlinkSync(shmRequestPath);
    } catch (err) {
      const isNotFound = err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT';
      if (!isNotFound) {
        throw new Error(`Failed to clean up stale shared memory file ${shmRequestPath}: ${err}`);
      }
    }

    try {
      unlinkSync(shmResponsePath);
    } catch (err) {
      const isNotFound = err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT';
      if (!isNotFound) {
        throw new Error(`Failed to clean up stale shared memory file ${shmResponsePath}: ${err}`);
      }
    }

    // Spawn bb process with shared memory mode (SPSC-only, no max-clients needed)
    const args = ['msgpack', 'run', '--input', `${shmName}.shm`, '--request-ring-size', `${1024 * 1024 * 4}`];
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
    // Retry connection every 100ms for up to 3 seconds
    const retryInterval = 100; // ms
    const timeout = 3000; // ms
    const maxAttempts = Math.floor(timeout / retryInterval);
    let client: any = null;

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
          // Create NAPI client (SPSC-only, no max_clients needed)
          client = new addon.MsgpackClient(shmName);
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

      return new BarretenbergNativeShmSyncBackend(bbProcess, client, logFd);
    } finally {
      // If we failed to connect, ensure the process is killed and log file closed
      // kill() returns false if process already exited, but doesn't throw
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

  call(inputBuffer: Uint8Array): Uint8Array {
    try {
      const responseBuffer = this.client.call(Buffer.from(inputBuffer));
      return new Uint8Array(responseBuffer);
    } catch (err: any) {
      throw new Error(`Shared memory call failed: ${err.message}`);
    }
  }

  private cleanup(): void {
    if (this.client) {
      try {
        this.client.close();
      } catch (e) {
        // Ignore errors during cleanup
      }
    }
    if (this.logFd !== undefined) {
      try {
        closeSync(this.logFd);
      } catch (e) {
        // Ignore errors during cleanup
      }
    }
  }

  destroy(): void {
    this.cleanup();
    this.process.kill('SIGTERM');
    // Remove process event listeners to prevent hanging
    this.process.removeAllListeners();
  }
}
