import * as net from "node:net";
import { IpcClientAsync } from "./types.js";

interface PendingCall {
  resolve: (resp: Uint8Array) => void;
  reject: (err: Error) => void;
}

export interface UdsIpcClientConnectOptions {
  /** Mark the socket as unref'd so it doesn't keep the Node event loop alive when idle. */
  unref?: boolean;
  /**
   * Retry budget (ms) for the initial connect when the server has bound the
   * path but not yet called listen(). Set to 0 to fail immediately on
   * ECONNREFUSED. Default 5000.
   */
  connectTimeoutMs?: number;
}

/**
 * Async IPC client over a Unix Domain Socket. Wire format matches the C++
 * ipc::IpcServer/IpcClient socket transport: 4-byte little-endian length
 * prefix followed by `length` bytes of msgpack payload, per direction.
 *
 * Supports pipelining: multiple concurrent `call()` invocations are queued
 * FIFO and matched with responses in order. Pipelining keeps the server-side
 * socket window full and matches the native client behaviour.
 */
export class UdsIpcClient implements IpcClientAsync {
  private buffer: Buffer = Buffer.alloc(0);
  private pending: PendingCall[] = [];
  private destroyed = false;

  private constructor(private conn: net.Socket) {
    conn.on("data", (chunk) => this.onData(chunk));
    conn.on("error", (err) => this.failAll(err));
    conn.on("close", () => this.failAll(new Error("socket closed")));
  }

  static async connect(
    socketPath: string,
    opts?: UdsIpcClientConnectOptions,
  ): Promise<UdsIpcClient> {
    const conn = await connectWithRetry(
      socketPath,
      opts?.connectTimeoutMs ?? 5000,
    );
    conn.setNoDelay(true);
    if (opts?.unref) conn.unref();
    return new UdsIpcClient(conn);
  }

  /** Number of in-flight calls awaiting a response. */
  get inflight(): number {
    return this.pending.length;
  }

  /** Underlying socket — exposed for ref/unref control (event-loop tuning). */
  get socket(): net.Socket {
    return this.conn;
  }

  async call(input: Uint8Array): Promise<Uint8Array> {
    if (this.destroyed) {
      throw new Error("UdsIpcClient: call() after destroy()");
    }
    return new Promise<Uint8Array>((resolve, reject) => {
      this.pending.push({ resolve, reject });
      const lenBuf = Buffer.allocUnsafe(4);
      lenBuf.writeUInt32LE(input.length, 0);
      this.conn.write(lenBuf);
      this.conn.write(input);
    });
  }

  async destroy(): Promise<void> {
    this.destroyed = true;
    this.conn.removeAllListeners();
    this.conn.destroy();
    this.failAll(new Error("UdsIpcClient destroyed"));
  }

  private onData(chunk: Buffer): void {
    this.buffer =
      this.buffer.length === 0
        ? Buffer.from(chunk)
        : Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 4) {
      const len = this.buffer.readUInt32LE(0);
      if (this.buffer.length < 4 + len) return;
      const payload = this.buffer.subarray(4, 4 + len);
      this.buffer = this.buffer.subarray(4 + len);
      const next = this.pending.shift();
      if (next) next.resolve(new Uint8Array(payload));
    }
  }

  private failAll(err: Error): void {
    const pending = this.pending;
    this.pending = [];
    for (const p of pending) p.reject(err);
  }
}

/**
 * Connect to `socketPath`, retrying on ECONNREFUSED until `timeoutMs`
 * elapses. ECONNREFUSED happens in the narrow window between the server's
 * bind() and listen(); other errors fail immediately.
 */
async function connectWithRetry(
  socketPath: string,
  timeoutMs: number,
): Promise<net.Socket> {
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;
  let lastErr: Error | undefined;
  while (true) {
    try {
      return await attemptConnect(socketPath);
    } catch (err) {
      lastErr = err as Error;
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ECONNREFUSED" && code !== "ENOENT") {
        throw new Error(`UdsIpcClient: connect failed: ${lastErr.message}`);
      }
      if (Date.now() >= deadline) {
        throw new Error(`UdsIpcClient: connect timed out: ${lastErr.message}`);
      }
      const delay = Math.min(50, 5 * 2 ** attempt++);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

function attemptConnect(socketPath: string): Promise<net.Socket> {
  return new Promise<net.Socket>((resolve, reject) => {
    const conn = net.createConnection(socketPath);
    const onError = (err: Error) => {
      conn.removeListener("connect", onConnect);
      conn.destroy();
      reject(err);
    };
    const onConnect = () => {
      conn.removeListener("error", onError);
      resolve(conn);
    };
    conn.once("connect", onConnect);
    conn.once("error", onError);
  });
}
