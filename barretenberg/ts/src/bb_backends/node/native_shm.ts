import { createRequire } from 'module';
import { spawn, ChildProcess } from 'child_process';
import { IMsgpackBackendSync } from '../interface.js';
import { findNapiBinary, findPackageRoot } from './platform.js';

// Import the NAPI module
// The addon is built to the nodejs_module directory
const addonPath = findNapiBinary();
// Try loading, but don't throw if it doesn't exist (will be caught in constructor)
let addon: any = null;
try {
  if (addonPath) {
    const require = createRequire(findPackageRoot()!);
    addon = require(addonPath);
  }
} catch (err) {
  // Addon not built yet or not available
  addon = null;
}

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

  private constructor(process: ChildProcess, client: any) {
    this.process = process;
    this.client = client;
  }

  /**
   * Create and initialize a shared memory backend.
   * @param bbBinaryPath Path to bb binary
   * @param threads Optional number of threads
   * @param maxClients Optional maximum concurrent clients (default: 1)
   */
  static async new(
    bbBinaryPath: string,
    threads?: number,
    maxClients?: number,
  ): Promise<BarretenbergNativeShmSyncBackend> {
    if (!addon || !addon.MsgpackClient) {
      throw new Error('Shared memory NAPI not available.');
    }

    // Create a unique shared memory name
    const shmName = `bb-${process.pid}-${Date.now()}`;

    // Default maxClients to 1 if not specified
    const clientCount = maxClients ?? 1;

    // Set HARDWARE_CONCURRENCY if threads specified
    const env = threads !== undefined ? { ...process.env, HARDWARE_CONCURRENCY: threads.toString() } : process.env;

    // Spawn bb process with shared memory mode
    const args = [bbBinaryPath, 'msgpack', 'run', '--input', `${shmName}.shm`, '--max-clients', clientCount.toString()];
    const bbProcess = spawn(findPackageRoot() + '/scripts/kill_wrapper.sh', args, {
      stdio: ['ignore', 'ignore', 'ignore'],
      env,
    });
    // Disconnect from event loop so process can exit. The kill wrapper will reap bb once parent (node) dies.
    bbProcess.unref();

    // Capture stderr for error diagnostics
    // bbProcess.stderr?.on('data', (data: Buffer) => {
    //   stderrOutput += data.toString();
    // });

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
          // Create NAPI client with matching max_clients value
          client = new addon.MsgpackClient(shmName, clientCount);
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

      return new BarretenbergNativeShmSyncBackend(bbProcess, client);
    } finally {
      // If we failed to connect, ensure the process is killed
      // kill() returns false if process already exited, but doesn't throw
      if (!client) {
        bbProcess.kill('SIGKILL');
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
  }

  destroy(): void {
    this.cleanup();
    this.process.kill('SIGTERM');
    // Remove process event listeners to prevent hanging
    this.process.removeAllListeners();
  }
}
