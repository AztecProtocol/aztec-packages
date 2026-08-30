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
  /**
   * Unref the socket while idle so it doesn't keep the Node event loop
   * alive; it is re-ref'd while calls are in flight so a response can never
   * be lost to an early process exit.
   */
  unref?: boolean;
  /**
   * Retry budget (ms) for the initial connect when the server has bound the
   * path but not yet called listen(). Set to 0 to fail immediately on
   * ECONNREFUSED. Default CONNECT_RETRY_BUDGET_MS (5000).
   */
  connectTimeoutMs?: number;
  /**
   * Abandons the connect. Callers that race the connect against something
   * else (a spawned server dying, say) must abort the loser: otherwise it
   * keeps retrying on a timer until its budget expires, holding the event
   * loop open long after the caller gave up.
   */
  signal?: AbortSignal;
}

/**
 * Async IPC client over a Unix Domain Socket. Wire format matches the C++
 * ipc::IpcServer/IpcClient socket transport: 4-byte little-endian length
 * prefix, 8-byte little-endian request id, then the msgpack payload (the
 * length counts the id plus the payload), per direction.
 *
 * Supports pipelining: each call carries a unique request id which the
 * server echoes on the response, so responses are paired to callers by id
 * and the server may complete requests in any order. Ids start at a random
 * point per connection.
 */
export class UdsIpcClient implements IpcClientAsync {
  private buffer: Buffer = Buffer.alloc(0);
  private pending = new Map<bigint, PendingCall>();
  private nextRequestId =
    (BigInt(Math.floor(Math.random() * 0xffffffff)) << 16n) + 1n;
  private destroyed = false;
  /** Set once the socket has errored/closed; new calls fail fast. */
  private closed = false;

  private constructor(
    private conn: net.Socket,
    private readonly idleUnref: boolean,
  ) {
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
      opts?.signal,
    );
    conn.setNoDelay(true);
    if (opts?.unref) conn.unref();
    return new UdsIpcClient(conn, opts?.unref ?? false);
  }

  /** Number of in-flight calls awaiting a response. */
  get inflight(): number {
    return this.pending.size;
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
      const requestId = this.nextRequestId++;
      if (this.idleUnref && this.pending.size === 0) {
        this.conn.ref();
      }
      this.pending.set(requestId, { resolve, reject });
      const header = Buffer.allocUnsafe(12);
      header.writeUInt32LE(input.length + 8, 0); // length counts id + payload
      header.writeBigUInt64LE(requestId, 4);
      this.conn.write(header);
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
      if (len < 8) {
        // Shorter than the request-id field: the server speaks the id-less
        // protocol. Fail loudly instead of misparsing.
        this.conn.destroy();
        this.failAll(
          new IpcTransportError(
            `UdsIpcClient: ${len}-byte frame is shorter than the request-id field — ` +
              "IPC protocol mismatch (envelope ids); update the peer binary/package",
          ),
        );
        return;
      }
      if (this.buffer.length < 4 + len) return;
      const requestId = this.buffer.readBigUInt64LE(4);
      const payload = this.buffer.subarray(12, 4 + len);
      this.buffer = this.buffer.subarray(4 + len);
      const next = this.pending.get(requestId);
      if (next) {
        this.pending.delete(requestId);
        if (this.idleUnref && this.pending.size === 0) {
          this.conn.unref();
        }
        next.resolve(new Uint8Array(payload));
      } else {
        // A response that pairs with no pending call means the stream's
        // correlation is broken — fail everything loudly rather than
        // continuing on a connection we can no longer trust.
        this.conn.destroy();
        this.failAll(
          new IpcTransportError(
            `UdsIpcClient: response for unknown request id ${requestId} — protocol desync`,
          ),
        );
        return;
      }
    }
  }

  private failAll(err: Error): void {
    this.closed = true;
    const pending = [...this.pending.values()];
    this.pending.clear();
    for (const p of pending) p.reject(err);
  }
}

/**
 * Connect to `socketPath`, retrying "server not ready" errors until
 * `timeoutMs` elapses: ENOENT (socket file not created yet), ECONNREFUSED
 * (the window between the server's bind() and listen()), EAGAIN (Linux
 * reports this for a UDS connect when the accept backlog is momentarily
 * full), and ECONNRESET (a connect racing the server's accept loop under
 * connection churn). Other errors fail immediately. Each attempt is also
 * capped at the remaining budget, so a bound-but-never-accepting server
 * cannot hang the connect past the deadline.
 */
async function connectWithRetry(
  socketPath: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<net.Socket> {
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;
  let lastErr: Error | undefined;
  while (true) {
    if (signal?.aborted) {
      throw new IpcTransportError("UdsIpcClient: connect aborted");
    }
    try {
      const remainingMs = Math.max(1, deadline - Date.now());
      return await attemptConnect(socketPath, remainingMs);
    } catch (err) {
      lastErr = err as Error;
      const code = (err as NodeJS.ErrnoException).code;
      if (
        code !== "ECONNREFUSED" &&
        code !== "ECONNRESET" &&
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
      await sleep(delay, signal);
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

/** Wait `ms`, returning early (and clearing the timer) if `signal` aborts. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
