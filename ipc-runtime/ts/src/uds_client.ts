import * as net from "node:net";
import { IpcTransportError } from "./errors.js";
import {
  IpcClientAsync,
  CONNECT_RETRY_BUDGET_MS,
  MAX_FRAME_SIZE,
} from "./types.js";

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
   * ECONNREFUSED. Default CONNECT_RETRY_BUDGET_MS (5000).
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
  /** Set once the socket has errored/closed; new calls fail fast. */
  private closed = false;

  private constructor(private conn: net.Socket) {
    conn.on("data", (chunk) => this.onData(chunk));
    conn.on("error", (err) =>
      this.failAll(
        new IpcTransportError(`UdsIpcClient: socket error: ${err.message}`, {
          cause: err,
        }),
      ),
    );
    conn.on("close", () =>
      this.failAll(new IpcTransportError("socket closed")),
    );
  }

  static async connect(
    socketPath: string,
    opts?: UdsIpcClientConnectOptions,
  ): Promise<UdsIpcClient> {
    const conn = await connectWithRetry(
      socketPath,
      opts?.connectTimeoutMs ?? CONNECT_RETRY_BUDGET_MS,
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
      throw new IpcTransportError("UdsIpcClient: call() after destroy()");
    }
    if (this.closed) {
      throw new IpcTransportError(
        "UdsIpcClient: call() on a closed/errored socket",
      );
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
    this.failAll(new IpcTransportError("UdsIpcClient destroyed"));
  }

  private onData(chunk: Buffer): void {
    this.buffer =
      this.buffer.length === 0
        ? Buffer.from(chunk)
        : Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 4) {
      const len = this.buffer.readUInt32LE(0);
      if (len > MAX_FRAME_SIZE) {
        // Corrupt/malicious frame — close instead of buffering up to the
        // claimed size.
        this.conn.destroy();
        this.failAll(
          new IpcTransportError(
            `UdsIpcClient: oversized frame (${len} bytes exceeds MAX_FRAME_SIZE)`,
          ),
        );
        return;
      }
      if (this.buffer.length < 4 + len) return;
      const payload = this.buffer.subarray(4, 4 + len);
      this.buffer = this.buffer.subarray(4 + len);
      const next = this.pending.shift();
      if (next) {
        next.resolve(new Uint8Array(payload));
      } else {
        // Protocol desync — every response should match a pending call.
        console.warn(
          `UdsIpcClient: dropping ${len}-byte response with no pending caller`,
        );
      }
    }
  }

  private failAll(err: Error): void {
    this.closed = true;
    const pending = this.pending;
    this.pending = [];
    for (const p of pending) p.reject(err);
  }
}

/**
 * Connect to `socketPath`, retrying "server not ready" errors until
 * `timeoutMs` elapses: ENOENT (socket file not created yet), ECONNREFUSED
 * (the window between the server's bind() and listen()), and EAGAIN (Linux
 * reports this for a UDS connect when the accept backlog is momentarily
 * full). Other errors fail immediately. Each attempt is also capped at the
 * remaining budget, so a bound-but-never-accepting server cannot hang the
 * connect past the deadline.
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
      const remainingMs = Math.max(1, deadline - Date.now());
      return await attemptConnect(socketPath, remainingMs);
    } catch (err) {
      lastErr = err as Error;
      const code = (err as NodeJS.ErrnoException).code;
      if (
        code !== "ECONNREFUSED" &&
        code !== "ENOENT" &&
        code !== "ETIMEDOUT" &&
        code !== "EAGAIN"
      ) {
        throw new IpcTransportError(
          `UdsIpcClient: connect failed: ${lastErr.message}`,
          { cause: lastErr },
        );
      }
      if (Date.now() >= deadline) {
        throw new IpcTransportError(
          `UdsIpcClient: connect timed out: ${lastErr.message}`,
          { cause: lastErr },
        );
      }
      const delay = Math.min(50, 5 * 2 ** attempt++);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

function attemptConnect(
  socketPath: string,
  timeoutMs: number,
): Promise<net.Socket> {
  return new Promise<net.Socket>((resolve, reject) => {
    const conn = net.createConnection(socketPath);
    const cleanup = () => {
      conn.removeListener("connect", onConnect);
      conn.removeListener("error", onError);
      clearTimeout(timer);
    };
    const onError = (err: Error) => {
      cleanup();
      conn.destroy();
      reject(err);
    };
    const onConnect = () => {
      cleanup();
      resolve(conn);
    };
    const timer = setTimeout(() => {
      cleanup();
      conn.destroy();
      const err: NodeJS.ErrnoException = new Error(
        `connect attempt timed out after ${timeoutMs}ms`,
      );
      err.code = "ETIMEDOUT";
      reject(err);
    }, timeoutMs);
    conn.once("connect", onConnect);
    conn.once("error", onError);
  });
}
