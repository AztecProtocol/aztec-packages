import * as net from "node:net";
import * as fs from "node:fs";
import { FrameReader } from "./frame_reader.js";

/**
 * Handler signature mirrors the C++ ipc::IpcServer::Handler: receive raw
 * bytes, return raw bytes. msgpack decode/encode and command dispatch are
 * the caller's responsibility (or the codegen's, when a generated dispatcher
 * is wired in).
 */
export type IpcServerHandler = (
  clientId: number,
  request: Uint8Array,
) => Promise<Uint8Array> | Uint8Array;

/**
 * UDS server with the same wire format as UdsIpcClient and the C++
 * ipc::IpcServer socket transport: 4-byte LE length prefix, 8-byte LE request
 * id (echoed on the response), then the payload; the length counts the id
 * plus the payload. Accepts multiple concurrent connections; handler
 * invocations are serialised per-connection.
 *
 * Signal handling is the caller's responsibility (unlike the C++ server's
 * install_default_signal_handlers); the socket file is unlinked on close()
 * and best-effort on process exit.
 */
export class UdsIpcServer {
  private server: net.Server;
  private nextClientId = 0;
  private connections = new Set<net.Socket>();
  private readonly unlinkOnExit = () => {
    try {
      fs.unlinkSync(this.socketPath);
    } catch {
      /* may already be gone */
    }
  };

  private constructor(
    server: net.Server,
    private socketPath: string,
  ) {
    this.server = server;
  }

  static async listen(
    socketPath: string,
    handler: IpcServerHandler,
  ): Promise<UdsIpcServer> {
    try {
      fs.unlinkSync(socketPath);
    } catch {
      /* socket file may not exist; ignore */
    }

    const server = net.createServer();
    const instance = new UdsIpcServer(server, socketPath);
    server.on("connection", (conn) => instance.handleConnection(conn, handler));

    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error) => {
        server.removeListener("listening", onListening);
        reject(err);
      };
      const onListening = () => {
        server.removeListener("error", onError);
        resolve();
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(socketPath);
    });

    // Restrict the socket to the owner, matching the C++ server (and the
    // 0600 mode used for SHM segments).
    fs.chmodSync(socketPath, 0o600);

    // Best-effort cleanup if the process exits without close().
    process.on("exit", instance.unlinkOnExit);

    return instance;
  }

  async close(): Promise<void> {
    // Force-close live connections (matching the C++ server's shutdown) so close()
    // resolves promptly instead of blocking until every client happens to disconnect.
    for (const conn of this.connections) {
      conn.destroy();
    }
    this.connections.clear();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
    process.removeListener("exit", this.unlinkOnExit);
    try {
      fs.unlinkSync(this.socketPath);
    } catch {
      /* may already be gone */
    }
  }

  private handleConnection(conn: net.Socket, handler: IpcServerHandler): void {
    const clientId = this.nextClientId++;
    this.connections.add(conn);
    conn.on("close", () => this.connections.delete(conn));
    const frames = new FrameReader();
    let chain: Promise<void> = Promise.resolve();

    conn.on("data", (chunk: Buffer) => {
      frames.push(chunk);
      for (;;) {
        const len = frames.peekLength();
        if (len === undefined) break;
        if (len < 8) {
          // Shorter than the request-id field: the peer speaks the id-less
          // protocol. Drop the connection with a clear reason.
          conn.destroy(
            new Error(
              `UdsIpcServer: ${len}-byte frame is shorter than the request-id field — ` +
                "IPC protocol mismatch (envelope ids); update the peer binary/package",
            ),
          );
          return;
        }
        const frame = frames.next();
        if (frame === undefined) break;
        const requestId = frame.readBigUInt64LE(4);
        // Copy into a standalone Buffer (not a subarray view, and not a plain Uint8Array): handlers
        // decode with msgpackr, which relies on Buffer semantics for correct string/binary decoding.
        const payload = Buffer.from(frame.subarray(12));

        const prev = chain;
        chain = (async () => {
          await prev;
          try {
            const resp = await handler(clientId, payload);
            const header = Buffer.allocUnsafe(12);
            header.writeUInt32LE(resp.length + 8, 0); // length counts id + payload
            header.writeBigUInt64LE(requestId, 4);
            conn.write(header);
            conn.write(resp);
          } catch (err) {
            conn.destroy(err as Error);
          }
        })();
        void chain.catch(() => {
          /* errors already handled by destroying the connection */
        });
      }
    });

    conn.on("error", () => {
      /* swallowed — clients reconnect */
    });
  }
}
