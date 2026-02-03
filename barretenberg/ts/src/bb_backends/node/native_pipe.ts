import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import { IMsgpackBackendSync, IMsgpackBackendAsync } from '../interface.js';

/**
 * Asynchronous native backend that communicates with bb binary via stdin/stdout.
 * Uses event-based I/O with a state machine to handle partial reads.
 *
 * Protocol:
 * - Request: 4-byte little-endian length + msgpack buffer
 * - Response: 4-byte little-endian length + msgpack buffer
 */
export class BarretenbergNativePipeAsyncBackend implements IMsgpackBackendAsync {
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
