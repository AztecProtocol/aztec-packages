import { createRequire } from 'module';
import { spawn, ChildProcess } from 'child_process';
import { openSync, closeSync } from 'fs';
import { Decoder, Encoder } from 'msgpackr';
import { IMsgpackBackendAsync } from '../interface.js';
import { findNapiBinary, findPackageRoot } from './platform.js';
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
 * - TypeScript connects via NAPI wrapper (MsgpackClientAsync)
 * - TypeScript manages promise queue (single-threaded, no mutex needed)
 * - C++ background thread polls for responses, calls JavaScript callback
 * - JavaScript callback routes responses by FIFO (legacy) or request_id (async)
 */
export class BarretenbergNativeShmAsyncBackend implements IMsgpackBackendAsync {
  private process: ChildProcess;
  private client: any; // NAPI MsgpackClientAsync instance
  private logFd?: number; // File descriptor for logs

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

  // Shared decoder/encoder for inspecting and wrapping messages
  private decoder: Decoder = new Decoder({ useRecords: false });
  private encoder: Encoder = new Encoder({ useRecords: false });

  private constructor(process: ChildProcess, client: any, logFd?: number) {
    this.process = process;
    this.client = client;
    this.logFd = logFd;

    // Register our response handler with the C++ client
    // This callback will be invoked from the background thread via ThreadSafeFunction
    this.client.setResponseCallback((responseBuffer: Buffer) => {
      this.handleResponse(responseBuffer);
    });
  }

  /**
   * Handle response from C++ background thread.
   * Routes to async callback (by request_id) or FIFO callback (legacy).
   */
  private handleResponse(responseBuffer: Buffer): void {
    const data = new Uint8Array(responseBuffer);

    // Try to detect async response: [request_id, CommandResponse]
    try {
      const decoded = this.decoder.unpack(data);
      if (Array.isArray(decoded) && decoded.length === 2 && typeof decoded[0] === 'number' && decoded[0] > 0) {
        const requestId = decoded[0] as number;
        const callback = this.asyncCallbacks.get(requestId);
        if (callback) {
          this.asyncCallbacks.delete(requestId);
          // Re-encode just the inner CommandResponse
          const innerBuffer = this.encoder.pack(decoded[1]);
          callback.resolve(new Uint8Array(innerBuffer));
        } else {
          console.warn(`Received async response for unknown request_id ${requestId}`);
        }
        this.maybeReleaseRef();
        return;
      }
    } catch {
      // Fall through to legacy FIFO handling
    }

    // Legacy FIFO response
    const callback = this.pendingCallbacks.shift();
    if (callback) {
      callback.resolve(data);
    } else {
      console.warn('Received response but no pending callback');
    }
    this.maybeReleaseRef();
  }

  /** Release ref when no callbacks are pending, allowing process to exit. */
  private maybeReleaseRef(): void {
    if (this.pendingCallbacks.length === 0 && this.asyncCallbacks.size === 0) {
      this.client.release();
    }
  }

  /**
   * Create and initialize an async shared memory backend.
   * @param bbBinaryPath Path to bb binary
   * @param threads Optional number of threads (defaults to min(32, num_cpus))
   * @param logger Optional logger function for bb output
   */
  static async new(
    bbBinaryPath: string,
    napiPath: string,
    threads?: number,
    logger?: (msg: string) => void,
  ): Promise<BarretenbergNativeShmAsyncBackend> {
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
      throw new Error('Shared memory async NAPI not available.');
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
          // Create NAPI async client
          client = new addon.MsgpackClientAsync(shmName);
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

  /**
   * Send a synchronous (FIFO) msgpack request.
   * Supports pipelining - can be called multiple times before awaiting responses.
   */
  async call(inputBuffer: Uint8Array): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      // If this is the first pending callback, acquire ref to keep event loop alive
      if (this.pendingCallbacks.length === 0 && this.asyncCallbacks.size === 0) {
        this.client.acquire();
      }

      // Enqueue this promise's callbacks (FIFO order)
      this.pendingCallbacks.push({ resolve, reject });

      try {
        // Send request to shared memory (synchronous write)
        this.client.call(Buffer.from(inputBuffer));
      } catch (err: any) {
        // Send failed - dequeue the callback we just added and reject
        this.pendingCallbacks.pop();

        // If queue is now empty, release ref to allow exit
        if (this.pendingCallbacks.length === 0 && this.asyncCallbacks.size === 0) {
          this.client.release();
        }

        reject(new Error(`Shared memory async call failed: ${err.message}`));
      }
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
    const requestId = this.nextRequestId++;

    // Wrap the command: input is [Command], we wrap as [request_id, Command]
    const decoded = this.decoder.unpack(inputBuffer);
    if (!Array.isArray(decoded) || decoded.length !== 1) {
      throw new Error('Expected input to be a 1-element array [Command]');
    }
    const wrappedBuffer = this.encoder.pack([requestId, decoded[0]]);

    const response = new Promise<Uint8Array>((resolve, reject) => {
      // Acquire ref if this is the first pending callback
      if (this.pendingCallbacks.length === 0 && this.asyncCallbacks.size === 0) {
        this.client.acquire();
      }

      this.asyncCallbacks.set(requestId, { resolve, reject });

      try {
        this.client.call(Buffer.from(wrappedBuffer));
      } catch (err: any) {
        this.asyncCallbacks.delete(requestId);
        if (this.pendingCallbacks.length === 0 && this.asyncCallbacks.size === 0) {
          this.client.release();
        }
        reject(new Error(`Shared memory async call failed: ${err.message}`));
      }
    });

    return { requestId, response };
  }

  async destroy(): Promise<void> {
    // Kill the bb process
    // Background thread and callbacks will be cleaned up by OS on process exit
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
