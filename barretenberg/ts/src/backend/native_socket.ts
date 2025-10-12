import { spawn, ChildProcess } from 'child_process';
import * as net from 'net';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { IMsgpackBackendSync, IMsgpackBackendAsync } from './interface.js';

/**
 * Synchronous native backend that communicates with bb binary via Unix Domain Socket.
 * Uses blocking socket I/O to maintain synchronous semantics.
 *
 * Architecture: bb acts as the SERVER, TypeScript is the CLIENT
 * - bb creates the socket and listens for connections
 * - TypeScript waits for socket file to exist, then connects
 *
 * Protocol:
 * - Request: 4-byte little-endian length + msgpack buffer
 * - Response: 4-byte little-endian length + msgpack buffer
 */
export class BarretenbergNativeSocketSyncBackend implements IMsgpackBackendSync {
  private process: ChildProcess;
  private socket: net.Socket;
  private socketPath: string;

  constructor(bbBinaryPath: string) {
    // Create a unique socket path in temp directory
    this.socketPath = path.join(os.tmpdir(), `bb-${process.pid}-${Date.now()}.sock`);

    // Ensure socket path doesn't already exist (cleanup from previous crashes)
    if (fs.existsSync(this.socketPath)) {
      fs.unlinkSync(this.socketPath);
    }

    // Spawn bb process - it will create the socket server
    this.process = spawn(bbBinaryPath, ['msgpack', 'run', '--input', this.socketPath], {
      stdio: ['ignore', 'ignore', 'inherit'], // Ignore stdin/stdout, inherit stderr
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

    // Wait for bb to create the socket file (bb is the server)
    const startTime = Date.now();
    while (!fs.existsSync(this.socketPath)) {
      if (Date.now() - startTime > 5000) {
        this.cleanup();
        throw new Error('Timeout waiting for bb to create socket file');
      }
      // Busy wait 10ms
      const sleepStart = Date.now();
      while (Date.now() - sleepStart < 10) {
        // Busy wait
      }
    }

    // Additional check: ensure it's actually a socket
    try {
      const stats = fs.statSync(this.socketPath);
      if (!stats.isSocket()) {
        this.cleanup();
        throw new Error(`Path exists but is not a socket: ${this.socketPath}`);
      }
    } catch (err: any) {
      this.cleanup();
      throw new Error(`Failed to stat socket file: ${err.message}`);
    }

    // Connect to bb's socket server
    this.socket = net.connect(this.socketPath);

    // Disable Nagle's algorithm for lower latency
    this.socket.setNoDelay(true);

    // Wait for connection to be established (busy-wait pattern for sync API)
    let connected = false;
    let connectionError: Error | undefined = undefined;

    this.socket.once('connect', () => {
      connected = true;
    });

    this.socket.once('error', (err: Error) => {
      connectionError = err;
    });

    // Busy-wait for connection (timeout after 5 seconds)
    const connectStartTime = Date.now();
    while (!connected && !connectionError) {
      if (Date.now() - connectStartTime > 5000) {
        this.cleanup();
        throw new Error('Timeout waiting for socket connection to bb server');
      }
      // Busy wait 10ms
      const sleepStart = Date.now();
      while (Date.now() - sleepStart < 10) {
        // Busy wait
      }
    }

    if (connectionError) {
      this.cleanup();
      throw new Error(`Failed to connect to bb socket: ${connectionError.message}`);
    }
  }

  call(inputBuffer: Uint8Array): Uint8Array {
    // Write request: 4-byte little-endian length + msgpack data
    const lengthBuf = Buffer.alloc(4);
    lengthBuf.writeUInt32LE(inputBuffer.length, 0);
    this.socket.write(lengthBuf);
    this.socket.write(inputBuffer);

    // Read response length: 4 bytes little-endian
    const responseLengthBuf = this.readExactly(4);
    const responseLength = responseLengthBuf.readUInt32LE(0);

    // Read response data: msgpack buffer
    const responseBuffer = this.readExactly(responseLength);

    return new Uint8Array(responseBuffer);
  }

  /**
   * Read exactly the specified number of bytes from the socket.
   * Blocks until all bytes are available.
   */
  private readExactly(length: number): Buffer {
    const buffer = Buffer.alloc(length);
    let totalRead = 0;

    while (totalRead < length) {
      // Try to read from socket
      const chunk = this.socket.read(length - totalRead);

      if (chunk === null) {
        // No data available yet, wait for 'readable' event
        // Use a synchronous wait pattern
        let dataAvailable = false;
        const readableHandler = () => {
          dataAvailable = true;
        };

        this.socket.once('readable', readableHandler);

        // Wait for data with timeout
        const startTime = Date.now();
        while (!dataAvailable) {
          if (Date.now() - startTime > 30000) {
            // 30 second timeout
            this.socket.removeListener('readable', readableHandler);
            throw new Error(`Timeout reading from socket: got ${totalRead} bytes, expected ${length}`);
          }
          // Small sleep to avoid spinning
          const sleepStart = Date.now();
          while (Date.now() - sleepStart < 1) {
            // Busy wait 1ms
          }
        }

        continue;
      }

      // Copy chunk to buffer
      const bytesToCopy = Math.min(chunk.length, length - totalRead);
      chunk.copy(buffer, totalRead, 0, bytesToCopy);
      totalRead += bytesToCopy;

      // If we read more than needed, put the extra back
      if (chunk.length > bytesToCopy) {
        this.socket.unshift(chunk.subarray(bytesToCopy));
      }
    }

    return buffer;
  }

  private cleanup(): void {
    try {
      this.socket?.destroy();
    } catch (e) {
      // Ignore errors during cleanup
    }

    // Don't try to unlink socket - bb owns it and will clean it up
  }

  destroy(): void {
    this.cleanup();
    this.process.kill('SIGTERM');
    // Remove process event listeners to prevent hanging
    this.process.removeAllListeners();
  }
}

/**
 * Asynchronous native backend that communicates with bb binary via Unix Domain Socket.
 * Uses event-based I/O with a state machine to handle partial reads.
 *
 * Architecture: bb acts as the SERVER, TypeScript is the CLIENT
 * - bb creates the socket and listens for connections
 * - TypeScript waits for socket file to exist, then connects
 *
 * Protocol:
 * - Request: 4-byte little-endian length + msgpack buffer
 * - Response: 4-byte little-endian length + msgpack buffer
 */
export class BarretenbergNativeSocketAsyncBackend implements IMsgpackBackendAsync {
  private process: ChildProcess;
  private socket: net.Socket | null = null;
  private socketPath: string;
  private connectionPromise: Promise<void>;
  private connectionTimeout: NodeJS.Timeout | null = null;

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
    // Create a unique socket path in temp directory
    this.socketPath = path.join(os.tmpdir(), `bb-${process.pid}-${Date.now()}.sock`);

    // Ensure socket path doesn't already exist (cleanup from previous crashes)
    if (fs.existsSync(this.socketPath)) {
      fs.unlinkSync(this.socketPath);
    }

    let connectionResolve: (() => void) | null = null;
    let connectionReject: ((error: Error) => void) | null = null;

    this.connectionPromise = new Promise<void>((resolve, reject) => {
      connectionResolve = resolve;
      connectionReject = reject;
    });

    // Spawn bb process - it will create the socket server
    this.process = spawn(bbBinaryPath, ['msgpack', 'run', '--input', this.socketPath], {
      stdio: ['ignore', 'ignore', 'inherit'],
    });

    this.process.on('error', err => {
      if (connectionReject) {
        connectionReject(new Error(`Native backend process error: ${err.message}`));
        connectionReject = null;
        connectionResolve = null;
      }
      if (this.pendingReject) {
        this.pendingReject(new Error(`Native backend process error: ${err.message}`));
        this.pendingReject = null;
        this.pendingResolve = null;
      }
    });

    this.process.on('exit', (code, signal) => {
      const errorMsg =
        code !== null && code !== 0
          ? `Native backend process exited with code ${code}`
          : signal && signal !== 'SIGTERM'
            ? `Native backend process killed with signal ${signal}`
            : 'Native backend process exited unexpectedly';

      if (connectionReject) {
        connectionReject(new Error(errorMsg));
        connectionReject = null;
        connectionResolve = null;
      }
      if (this.pendingReject) {
        this.pendingReject(new Error(errorMsg));
        this.pendingReject = null;
        this.pendingResolve = null;
      }
    });

    // Wait for bb to create socket file, then connect
    this.waitForSocketAndConnect()
      .then(() => {
        if (connectionResolve) {
          connectionResolve();
          connectionResolve = null;
          connectionReject = null;
        }
      })
      .catch(err => {
        if (connectionReject) {
          connectionReject(err);
          connectionReject = null;
          connectionResolve = null;
        }
      });

    // Set a timeout for connection
    this.connectionTimeout = setTimeout(() => {
      if (connectionReject) {
        connectionReject(new Error('Timeout waiting for bb socket connection'));
        connectionReject = null;
        connectionResolve = null;
        this.cleanup();
      }
    }, 5000);
  }

  private async waitForSocketAndConnect(): Promise<void> {
    // Poll for socket file to exist (bb is creating it)
    const startTime = Date.now();
    while (!fs.existsSync(this.socketPath)) {
      if (Date.now() - startTime > 5000) {
        throw new Error('Timeout waiting for bb to create socket file');
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Additional check: ensure it's actually a socket
    const stats = fs.statSync(this.socketPath);
    if (!stats.isSocket()) {
      throw new Error(`Path exists but is not a socket: ${this.socketPath}`);
    }

    // Connect to bb's socket server as a client
    return new Promise<void>((resolve, reject) => {
      this.socket = net.connect(this.socketPath);

      // Disable Nagle's algorithm for lower latency
      this.socket.setNoDelay(true);

      // Set up event handlers
      this.socket.once('connect', () => {
        // Clear connection timeout on successful connection
        if (this.connectionTimeout) {
          clearTimeout(this.connectionTimeout);
          this.connectionTimeout = null;
        }
        resolve();
      });

      this.socket.once('error', err => {
        reject(new Error(`Failed to connect to bb socket: ${err.message}`));
      });

      // Set up data handler after connection is established
      this.socket.on('data', (chunk: Buffer) => {
        this.handleData(chunk);
      });

      // Handle ongoing errors after initial connection
      this.socket.on('error', err => {
        if (this.pendingReject) {
          this.pendingReject(new Error(`Socket error: ${err.message}`));
          this.pendingReject = null;
          this.pendingResolve = null;
        }
      });

      this.socket.on('end', () => {
        if (this.pendingReject) {
          this.pendingReject(new Error('Socket connection ended unexpectedly'));
          this.pendingReject = null;
          this.pendingResolve = null;
        }
      });
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
    // Wait for connection to be established
    await this.connectionPromise;

    if (!this.socket) {
      throw new Error('Socket not connected');
    }

    if (this.pendingResolve) {
      throw new Error('Cannot call while another call is pending (no pipelining supported)');
    }

    return new Promise((resolve, reject) => {
      this.pendingResolve = resolve;
      this.pendingReject = reject;

      // Write request: 4-byte little-endian length + msgpack data
      const lengthBuf = Buffer.alloc(4);
      lengthBuf.writeUInt32LE(inputBuffer.length, 0);
      this.socket!.write(lengthBuf);
      this.socket!.write(inputBuffer);
    });
  }

  private cleanup(): void {
    try {
      // Remove all event listeners to prevent hanging
      if (this.socket) {
        this.socket.removeAllListeners();
        this.socket.destroy();
      }
    } catch (e) {
      // Ignore errors during cleanup
    }

    // Clear connection timeout if still pending
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }

    // Remove process event listeners to prevent hanging
    this.process.removeAllListeners();

    // Don't try to unlink socket - bb owns it and will clean it up
  }

  async destroy(): Promise<void> {
    // Send SIGTERM for graceful shutdown
    this.process.kill('SIGTERM');

    // Wait for exit with 1-second timeout
    await Promise.race([
      new Promise<void>(resolve => {
        this.process.once('exit', () => {
          this.cleanup();
          resolve();
        });
      }),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout waiting for process exit')), 1000),
      ),
    ]).catch(() => {
      // If timeout or error, force kill and cleanup
      try {
        this.process.kill('SIGKILL');
      } catch (e) {
        // Process already dead
      }
      this.cleanup();
    });
  }
}
