import { loadIpcRuntimeNapi } from "./native_loader.js";
import { IpcClientAsync, IpcClientSync } from "./types.js";

/**
 * Minimum surface a NAPI msgpack client must expose. Satisfied by the
 * `MsgpackClient` / `MsgpackClientAsync` classes exported from this
 * package's own `ipc_runtime_napi.node` addon (see ipc-runtime/cpp/napi/),
 * which wraps the C++ ipc::IpcClient.
 *
 * The interface is exposed for tests / consumers that want to inject a
 * mock or alternative implementation; the standard production path is the
 * `createNapiShm{Sync,Async}Client` factories below, which load the
 * prebuilt addon shipped in this package's `build/<arch>-<os>/` directory.
 *
 * Note on the async contract: `MsgpackClientAsync.call` is *fire and
 * forget*. Responses arrive via `setResponseCallback` in FIFO order on a
 * background-thread → main-thread bridge (Napi::ThreadSafeFunction).
 * The TS wrapper below owns the request queue and matches responses.
 */
export interface NapiMsgpackClientSync {
  call(input: Buffer): Buffer;
  close(): void;
}

export interface NapiMsgpackClientAsync {
  setResponseCallback(cb: (response: Buffer) => void): void;
  call(input: Buffer): void;
  acquire(): void;
  release(): void;
}

/** Wraps a sync NAPI msgpack client behind the IpcClientSync interface. */
export class NapiShmSyncClient implements IpcClientSync {
  constructor(private inner: NapiMsgpackClientSync) {}

  call(input: Uint8Array): Uint8Array {
    const buf = Buffer.isBuffer(input)
      ? input
      : Buffer.from(input.buffer, input.byteOffset, input.byteLength);
    const resp = this.inner.call(buf);
    return new Uint8Array(resp.buffer, resp.byteOffset, resp.byteLength);
  }

  destroy(): void {
    this.inner.close();
  }
}

interface PendingCallback {
  resolve: (data: Uint8Array) => void;
  reject: (error: Error) => void;
}

/**
 * Wraps the fire-and-forget async NAPI msgpack client behind the
 * `IpcClientAsync` interface. Owns a FIFO queue of pending calls; the C++
 * background polling thread invokes `setResponseCallback` once per
 * response, and this wrapper matches it to the next queued caller.
 *
 * `acquire` / `release` are reference-count hooks the NAPI exposes so the
 * libuv loop is kept alive only while requests are outstanding — without
 * them a `node script.js` would never exit naturally.
 */
export class NapiShmAsyncClient implements IpcClientAsync {
  private readonly pending: PendingCallback[] = [];

  constructor(private inner: NapiMsgpackClientAsync) {
    this.inner.setResponseCallback((response: Buffer) => {
      const cb = this.pending.shift();
      if (cb) {
        cb.resolve(new Uint8Array(response));
      } else {
        // Unexpected — a response arrived but no caller is waiting.
        // Drop it; the bb-side wrapper also just warns in this case.
      }
      if (this.pending.length === 0) {
        this.inner.release();
      }
    });
  }

  call(input: Uint8Array): Promise<Uint8Array> {
    const buf = Buffer.isBuffer(input)
      ? input
      : Buffer.from(input.buffer, input.byteOffset, input.byteLength);
    return new Promise<Uint8Array>((resolve, reject) => {
      if (this.pending.length === 0) {
        this.inner.acquire();
      }
      this.pending.push({ resolve, reject });
      try {
        this.inner.call(buf);
      } catch (err: any) {
        // Send failed — unwind the queue entry we just added.
        this.pending.pop();
        if (this.pending.length === 0) {
          this.inner.release();
        }
        reject(
          err instanceof Error
            ? err
            : new Error(`SHM async call failed: ${String(err)}`),
        );
      }
    });
  }

  async destroy(): Promise<void> {
    // Reject anything still in flight.
    while (this.pending.length > 0) {
      const cb = this.pending.shift();
      cb?.reject(new Error("ipc-runtime SHM client destroyed before response"));
    }
  }
}

export interface CreateNapiShmOptions {
  /** MPSC client slot id (default 0). Distinct clients on the same shmName must use distinct slots. */
  clientId?: number;
  /** Override addon path lookup. Rarely needed; useful for tests / unusual deployments. */
  customAddonPath?: string;
}

/**
 * Factories that load the bundled `ipc_runtime_napi.node` addon and
 * construct an MPSC-SHM client wrapped behind the `IpcClient*` interface.
 * Matches the transport used by `ipc::make_server` on the C++ side, so any
 * server started via that helper accepts these clients directly.
 */
export function createNapiShmSyncClient(
  shmName: string,
  options: CreateNapiShmOptions = {},
): NapiShmSyncClient {
  const napi = loadIpcRuntimeNapi(options.customAddonPath);
  return new NapiShmSyncClient(
    new napi.MsgpackClient(shmName, options.clientId ?? 0),
  );
}

export function createNapiShmAsyncClient(
  shmName: string,
  options: CreateNapiShmOptions = {},
): NapiShmAsyncClient {
  const napi = loadIpcRuntimeNapi(options.customAddonPath);
  return new NapiShmAsyncClient(
    new napi.MsgpackClientAsync(shmName, options.clientId ?? 0),
  );
}
