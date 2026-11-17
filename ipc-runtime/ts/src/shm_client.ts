import { loadIpcRuntimeNapi } from "./native_loader.js";
import { IpcClientSync } from "./types.js";

/**
 * Minimum surface the NAPI msgpack client must expose. Satisfied by the
 * `MsgpackClient` class exported from this package's own
 * `ipc_runtime_napi.node` addon (see ipc-runtime/cpp/napi/), which wraps the
 * C++ ipc::IpcClient.
 *
 * Shared memory is the synchronous transport: a call blocks the calling
 * thread, spinning briefly and then sleeping, until the server answers. An
 * asynchronous caller uses a unix socket instead, or a napi or wasm instance
 * on a ServiceThread.
 *
 * The interface is exposed for tests / consumers that want to inject a mock
 * or alternative implementation; the standard production path is the
 * `createNapiShmSyncClient` factory below, which loads the prebuilt addon
 * shipped in this package's `build/<arch>-<os>/` directory.
 */
export interface NapiMsgpackClientSync {
  call(input: Buffer): Buffer;
  close(): void;
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

export interface CreateNapiShmOptions {
  /** MPSC client slot id (default 0). Distinct clients on the same shmName must use distinct slots. */
  clientId?: number;
  /** Override addon path lookup. Rarely needed; useful for tests / unusual deployments. */
  customAddonPath?: string;
  /**
   * The server's pid. A sync call holds the main thread, so
   * nothing else can notice the server dying; with the pid, a call to a dead
   * server throws (with `serverExited`, `exitCode` and `signal` set) instead
   * of waiting forever. Calls have no deadline either way.
   */
  serverPid?: number;
}

/**
 * Factories that load the bundled `ipc_runtime_napi.node` addon and
 * construct an MPSC-SHM client wrapped behind the `IpcClientSync` interface.
 * Matches the transport used by `ipc::make_server` on the C++ side, so any
 * server started via that helper accepts these clients directly.
 */
export function createNapiShmSyncClient(
  shmName: string,
  options: CreateNapiShmOptions = {},
): NapiShmSyncClient {
  const napi = loadIpcRuntimeNapi(options.customAddonPath);
  return new NapiShmSyncClient(
    // An undefined slot id makes the native side self-allocate a free slot
    // (kAutoClientId) instead of aliasing every client onto slot 0.
    new napi.MsgpackClient(shmName, options.clientId, options.serverPid),
  );
}
