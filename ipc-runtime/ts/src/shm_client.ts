import { IpcClientAsync, IpcClientSync } from "./types.js";

/**
 * Minimum surface a NAPI msgpack client must expose. Today this is satisfied
 * by `bb::nodejs::msgpack_client::MsgpackClientWrapper` (barretenberg/cpp/src/
 * barretenberg/nodejs_module/msgpack_client/) which in turn wraps the C++
 * ipc::IpcClient — so the wire format is identical to UdsIpcClient and any
 * future SPSC-SHM Rust/Zig client.
 *
 * The NAPI binding lives in the consumer (bb.js's nodejs_module.node) rather
 * than in this package, so ipc-runtime/ts stays native-free. Consumers
 * construct the NAPI handle themselves and pass it in.
 */
export interface NapiMsgpackClientSync {
  call(input: Buffer): Buffer;
  close(): void;
}

export interface NapiMsgpackClientAsync {
  call(input: Buffer): Promise<Buffer>;
  close(): Promise<void> | void;
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

/** Wraps an async NAPI msgpack client behind the IpcClientAsync interface. */
export class NapiShmAsyncClient implements IpcClientAsync {
  constructor(private inner: NapiMsgpackClientAsync) {}

  async call(input: Uint8Array): Promise<Uint8Array> {
    const buf = Buffer.isBuffer(input)
      ? input
      : Buffer.from(input.buffer, input.byteOffset, input.byteLength);
    const resp = await this.inner.call(buf);
    return new Uint8Array(resp.buffer, resp.byteOffset, resp.byteLength);
  }

  async destroy(): Promise<void> {
    await this.inner.close();
  }
}
