import { createRequire } from 'module';
import { spawn, ChildProcess } from 'child_process';
import { IMsgpackBackendSync } from './interface.js';
import { findNapiBinary } from './platform.js';

// Import the NAPI module
// The addon is built to the nodejs_module directory
const addonPath = findNapiBinary();
// Try loading, but don't throw if it doesn't exist (will be caught in constructor)
let addon: any = null;
try {
  if (addonPath) {
    const require = createRequire(import.meta.url);
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
export class BarretenbergShmSyncBackend implements IMsgpackBackendSync {
  private process: ChildProcess;
  private client: any; // NAPI MsgpackClient instance
  private shmName: string;

  constructor(bbBinaryPath: string, threads?: number, maxClients?: number) {
    if (!addon || !addon.MsgpackClient) {
      throw new Error(
        'NAPI addon not available. The nodejs_module must be built with shared memory support. ' +
          `Expected addon at: ${addonPath}`,
      );
    }

    // Create a unique shared memory name
    this.shmName = `bb-${process.pid}-${Date.now()}`;

    // Default maxClients to 1 if not specified
    const clientCount = maxClients ?? 1;

    // Set HARDWARE_CONCURRENCY if threads specified
    const env = threads !== undefined ? { ...process.env, HARDWARE_CONCURRENCY: threads.toString() } : process.env;

    // Spawn bb process with shared memory mode
    const args = ['msgpack', 'run', '--input', `${this.shmName}.shm`, '--max-clients', clientCount.toString()];
    this.process = spawn(bbBinaryPath, args, {
      stdio: ['ignore', 'ignore', 'ignore'],
      env,
    });

    // Handle process errors
    this.process.on('error', err => {
      throw new Error(`Native backend process error: ${err.message}`);
    });

    this.process.on('exit', (code, signal) => {
      if (code !== null && code !== 0) {
        throw new Error(`Native backend process exited with code ${code}`);
      }
      if (signal && signal !== 'SIGTERM') {
        throw new Error(`Native backend process killed with signal ${signal}`);
      }
    });

    // Wait for bb to create shared memory
    // Retry connection every 100ms for up to 3 seconds
    const retryInterval = 100; // ms
    const timeout = 3000; // ms
    const maxAttempts = Math.floor(timeout / retryInterval);
    let connected = false;

    for (let attempt = 0; attempt < maxAttempts && !connected; attempt++) {
      // Wait before attempting connection (except first attempt)
      if (attempt > 0) {
        const start = Date.now();
        while (Date.now() - start < retryInterval) {
          // Busy wait
        }
      }

      try {
        // Create NAPI client with matching max_clients value
        this.client = new addon.MsgpackClient(this.shmName, clientCount);
        connected = true;
      } catch (err: any) {
        // Connection failed, will retry
        if (attempt === maxAttempts - 1) {
          // Last attempt failed
          this.cleanup();
          throw new Error(`Failed to connect to shared memory after ${timeout}ms: ${err.message}`);
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
  }

  destroy(): void {
    this.cleanup();
    this.process.kill('SIGTERM');
    // Remove process event listeners to prevent hanging
    this.process.removeAllListeners();
  }
}
