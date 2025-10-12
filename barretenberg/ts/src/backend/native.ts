import { spawn, spawnSync, ChildProcess } from 'child_process';
import * as fs from 'fs';
import { IMsgpackBackendSync, IMsgpackBackendAsync } from './interface.js';
import { sign } from 'crypto';

/**
 * Synchronous native backend that communicates with bb binary via stdin/stdout.
 * Uses blocking I/O (fs.readSync/writeSync) to maintain synchronous semantics.
 *
 * Protocol:
 * - Request: 4-byte little-endian length + msgpack buffer
 * - Response: 4-byte little-endian length + msgpack buffer
 */
export class BarretenbergNativeSyncBackend implements IMsgpackBackendSync {
  private process: ChildProcess;
  private stdinFd: number;
  private stdoutFd: number;

  /**
   * Read from a file descriptor with retry on EAGAIN.
   * Since Node.js pipes are non-blocking, readSync can return EAGAIN when data isn't ready.
   */
  private readSyncWithRetry(fd: number, buffer: Buffer, offset: number, length: number): number {
    const maxRetries = 1000;
    const retryDelayMs = 1;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return fs.readSync(fd, buffer, offset, length, null);
      } catch (err: any) {
        if (err.code === 'EAGAIN' || err.code === 'EWOULDBLOCK') {
          // // Sleep briefly before retrying
          // const start = Date.now();
          // while (Date.now() - start < retryDelayMs) {
          //   // Busy wait
          // }
          continue;
        }
        throw err;
      }
    }
    throw new Error(`Failed to read from fd ${fd} after ${maxRetries} retries (EAGAIN)`);
  }

  constructor(bbBinaryPath: string) {
    this.process = spawn(bbBinaryPath, ['msgpack', 'run'], {
      stdio: ['pipe', 'pipe', 'inherit'], // stdin, stdout, inherit stderr
    });

    // Validate stdin/stdout streams exist
    if (!this.process.stdin) {
      throw new Error('Failed to create stdin pipe for native backend process');
    }
    if (!this.process.stdout) {
      throw new Error('Failed to create stdout pipe for native backend process');
    }

    // Get file descriptors for synchronous I/O
    // Try multiple ways to access the file descriptor
    const stdin = this.process.stdin as any;
    const stdout = this.process.stdout as any;

    const stdinFd = stdin.fd ?? stdin._handle?.fd;
    const stdoutFd = stdout.fd ?? stdout._handle?.fd;

    if (typeof stdinFd !== 'number') {
      throw new Error(
        `Failed to get stdin file descriptor from native backend process. ` +
          `Available properties: ${Object.keys(stdin).join(', ')}`,
      );
    }
    if (typeof stdoutFd !== 'number') {
      throw new Error(
        `Failed to get stdout file descriptor from native backend process. ` +
          `Available properties: ${Object.keys(stdout).join(', ')}`,
      );
    }

    this.stdinFd = stdinFd;
    this.stdoutFd = stdoutFd;

    // Note: Node.js pipes are non-blocking by default, which means fs.readSync() can return EAGAIN.
    // We handle this in the call() method by retrying reads when EAGAIN occurs.

    // Handle process errors
    this.process.on('error', err => {
      throw new Error(`Native backend process error: ${err.message}`);
    });

    this.process.on('exit', (code, signal) => {
      if (code !== null && code !== 0) {
        throw new Error(`Native backend process exited with code ${code}`);
      }
      if (signal && signal != 'SIGTERM') {
        throw new Error(`Native backend process killed with signal ${signal}`);
      }
    });
  }

  call(inputBuffer: Uint8Array): Uint8Array {
    // Write request: 4-byte little-endian length + msgpack data
    const lengthBuf = Buffer.alloc(4);
    lengthBuf.writeUInt32LE(inputBuffer.length, 0);
    fs.writeSync(this.stdinFd, lengthBuf);
    fs.writeSync(this.stdinFd, inputBuffer);

    // Read response length: 4 bytes little-endian (with EAGAIN retry)
    const responseLengthBuf = Buffer.alloc(4);
    let bytesRead = this.readSyncWithRetry(this.stdoutFd, responseLengthBuf, 0, 4);
    if (bytesRead !== 4) {
      throw new Error(`Failed to read response length: got ${bytesRead} bytes, expected 4`);
    }
    const responseLength = responseLengthBuf.readUInt32LE(0);

    // Read response data: msgpack buffer (with EAGAIN retry)
    const responseBuffer = Buffer.alloc(responseLength);
    let totalRead = 0;
    while (totalRead < responseLength) {
      bytesRead = this.readSyncWithRetry(this.stdoutFd, responseBuffer, totalRead, responseLength - totalRead);
      if (bytesRead === 0) {
        throw new Error(`Unexpected EOF while reading response: got ${totalRead} bytes, expected ${responseLength}`);
      }
      totalRead += bytesRead;
    }

    return new Uint8Array(responseBuffer);
  }

  destroy(): void {
    this.process.kill();
  }
}

/**
 * Asynchronous native backend that communicates with bb binary via stdin/stdout.
 * Uses event-based I/O with a state machine to handle partial reads.
 *
 * Protocol:
 * - Request: 4-byte little-endian length + msgpack buffer
 * - Response: 4-byte little-endian length + msgpack buffer
 */
export class BarretenbergNativeAsyncBackend implements IMsgpackBackendAsync {
  private process: ChildProcess;
  private pendingResolve: ((data: Uint8Array) => void) | null = null;
  private pendingReject: ((error: Error) => void) | null = null;

  // State machine for reading responses
  private readingLength: boolean = true;
  private lengthBuffer: Buffer = Buffer.alloc(4);
  private lengthBytesRead: number = 0;
  private responseLength: number = 0;
  private responseBuffer: Buffer | null = null;
  private responseBytesRead: number = 0;

  constructor(bbBinaryPath: string) {
    this.process = spawn(bbBinaryPath, ['msgpack', 'run'], {
      stdio: ['pipe', 'pipe', 'inherit'],
    });

    this.process.stdout!.on('data', (chunk: Buffer) => {
      this.handleData(chunk);
    });

    this.process.on('error', err => {
      if (this.pendingReject) {
        this.pendingReject(new Error(`Native backend process error: ${err.message}`));
        this.pendingReject = null;
        this.pendingResolve = null;
      }
    });

    this.process.on('exit', (code, signal) => {
      if (this.pendingReject) {
        if (code !== null && code !== 0) {
          this.pendingReject(new Error(`Native backend process exited with code ${code}`));
        } else if (signal) {
          if (signal != 'SIGTERM') {
            this.pendingReject(new Error(`Native backend process killed with signal ${signal}`));
          }
        } else {
          this.pendingReject(new Error('Native backend process exited unexpectedly'));
        }
        this.pendingReject = null;
        this.pendingResolve = null;
      }
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
          // Response is complete
          if (this.pendingResolve) {
            this.pendingResolve(new Uint8Array(this.responseBuffer!));
            this.pendingResolve = null;
            this.pendingReject = null;
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
    if (this.pendingResolve) {
      throw new Error('Cannot call while another call is pending (no pipelining supported)');
    }

    return new Promise((resolve, reject) => {
      this.pendingResolve = resolve;
      this.pendingReject = reject;

      // Write request: 4-byte little-endian length + msgpack data
      const lengthBuf = Buffer.alloc(4);
      lengthBuf.writeUInt32LE(inputBuffer.length, 0);
      this.process.stdin!.write(lengthBuf);
      this.process.stdin!.write(inputBuffer);
    });
  }

  async destroy(): Promise<void> {
    this.process.kill();
    return new Promise(resolve => {
      this.process.once('exit', () => resolve());
    });
  }
}
