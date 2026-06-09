import EventEmitter from 'node:events';
import * as fs from 'node:fs';
import * as net from 'node:net';
import type { Readable } from 'node:stream';

/**
 * Events emitted by FifoFrameReader.
 *
 * - `frame`: A complete frame payload (without the 4-byte length header).
 * - `error`: An unrecoverable error (invalid frame length, stream error).
 * - `end`: The underlying stream has ended.
 */
export interface FifoFrameReaderEvents {
  frame: [payload: Buffer];
  error: [error: Error];
  end: [];
}

/**
 * Reads length-delimited frames from a readable stream (typically a named FIFO pipe).
 *
 * Wire format: `[4-byte big-endian payload length][payload bytes]`
 *
 * Emits a `frame` event for each complete frame with the raw payload buffer.
 * Callers are responsible for deserializing the payload (e.g., via msgpack).
 *
 * On encountering an invalid payload length (0 or >maxPayloadSize), emits `error`
 * and destroys the stream.
 */
export class FifoFrameReader extends EventEmitter<FifoFrameReaderEvents> {
  private stream: Readable | null = null;
  private pendingBuf: Buffer = Buffer.alloc(0);
  private running = false;

  constructor(private readonly maxPayloadSize = 10 * 1024 * 1024) {
    super();
  }

  /** Open a FIFO at the given path and start reading frames. */
  start(fifoPath: string): void {
    // Read the FIFO through a libuv pipe handle (net.Socket) rather than fs.createReadStream.
    // An fs read stream services the pipe with a blocking threadpool read that destroy() cannot
    // cancel: if a writer never closes, that read stays parked and keeps the host process alive
    // (manifesting as Jest "did not exit"). Opening O_NONBLOCK and wrapping the fd in a pipe
    // handle makes reads epoll-based, so stop()'s destroy() releases the handle immediately,
    // regardless of whether the writer is still attached.
    const fd = fs.openSync(fifoPath, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
    let socket: net.Socket;
    try {
      socket = new net.Socket({ fd, readable: true, writable: false });
    } catch (err) {
      fs.closeSync(fd);
      throw err;
    }
    this.startFromStream(socket);
  }

  /** Start reading frames from an existing readable stream. */
  startFromStream(stream: Readable): void {
    if (this.running) {
      throw new Error('FifoFrameReader is already running');
    }
    this.running = true;
    this.pendingBuf = Buffer.alloc(0);
    this.stream = stream;

    stream.on('data', (chunk: Buffer | string) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      this.pendingBuf = this.pendingBuf.length > 0 ? Buffer.concat([this.pendingBuf, buf]) : buf;
      this.drainFrames();
    });

    stream.on('error', (err: Error) => {
      if (this.running) {
        this.emit('error', err);
      }
    });

    stream.on('end', () => {
      this.emit('end');
    });
  }

  /** Stop reading and destroy the underlying stream. */
  stop(): void {
    this.running = false;
    if (this.stream) {
      this.stream.destroy();
      this.stream = null;
    }
  }

  /** Parse complete frames out of the pending buffer. */
  private drainFrames(): void {
    while (this.pendingBuf.length >= 4) {
      const payloadLen = this.pendingBuf.readUInt32BE(0);
      if (payloadLen === 0 || payloadLen > this.maxPayloadSize) {
        this.emit('error', new Error(`Invalid payload length: ${payloadLen}`));
        this.stop();
        return;
      }

      const frameLen = 4 + payloadLen;
      if (this.pendingBuf.length < frameLen) {
        break; // Wait for more data
      }

      const payload = this.pendingBuf.subarray(4, frameLen);
      this.pendingBuf = this.pendingBuf.subarray(frameLen);
      this.emit('frame', Buffer.from(payload));
    }
  }
}
