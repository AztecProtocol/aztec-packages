import type { IpcClientSync } from "./types.js";

/**
 * Host for a WASI (`wasm32-wasip1`) "compute kernel" module that exposes the shared FFI ABI:
 *
 *   memory
 *   ipc_ffi_alloc(len: usize) -> *mut u8
 *   ipc_ffi_entry(in_ptr, in_len, out_ptr_out: **u8, out_len_out: *usize)
 *   ipc_ffi_free(ptr, len)
 *
 * It satisfies the `IpcClientSync` byte-in/byte-out contract the ipc-codegen clients consume, so
 * the same generated `<Service>Api` runs against a spawned native binary (UDS/SHM) or an in-process
 * wasm module with no client changes. Works in Node and the browser (randomness via WebCrypto).
 *
 * Only the handful of `wasi_snapshot_preview1` calls a self-contained compute module needs are
 * shimmed (random_get, fd_write, environ_*, proc_exit, clock_time_get); mirrors the minimal shim
 * bb.js uses. Single-threaded; a wasi-threads variant is a future addition.
 */
export class WasiModuleBackend implements IpcClientSync {
  private constructor(
    private readonly instance: WebAssembly.Instance,
    private readonly exports: WasiFfiExports,
  ) {}

  /** Instantiate a wasip1 module from its bytes (or a compiled Module). */
  static async create(
    wasm: BufferSource | WebAssembly.Module,
    logger: (msg: string) => void = () => {},
  ): Promise<WasiModuleBackend> {
    // `memory` is exported by the module (wasip1 default); the shim closes over the live instance.
    let inst: WebAssembly.Instance | undefined;
    const memory = () =>
      new Uint8Array((inst!.exports.memory as WebAssembly.Memory).buffer);
    const view = () =>
      new DataView((inst!.exports.memory as WebAssembly.Memory).buffer);

    const imports = { wasi_snapshot_preview1: wasiShim(memory, view, logger) };
    const source =
      wasm instanceof WebAssembly.Module
        ? await WebAssembly.instantiate(wasm, imports)
        : (await WebAssembly.instantiate(wasm, imports)).instance;
    inst =
      source instanceof WebAssembly.Instance
        ? source
        : (source as WebAssembly.WebAssemblyInstantiatedSource).instance;

    return new WasiModuleBackend(
      inst,
      inst.exports as unknown as WasiFfiExports,
    );
  }

  call(input: Uint8Array): Uint8Array {
    const { ipc_ffi_alloc, ipc_ffi_entry, ipc_ffi_free } = this.exports;

    const inPtr = ipc_ffi_alloc(input.length);
    this.mem().set(input, inPtr);

    // Two u32 out-slots: [out_ptr, out_len].
    const metaPtr = ipc_ffi_alloc(8);
    ipc_ffi_entry(inPtr, input.length, metaPtr, metaPtr + 4);

    // The call may have grown memory — re-view before reading.
    const dv = new DataView(
      (this.instance.exports.memory as WebAssembly.Memory).buffer,
    );
    const outPtr = dv.getUint32(metaPtr, true);
    const outLen = dv.getUint32(metaPtr + 4, true);
    const output = this.mem().slice(outPtr, outPtr + outLen);

    ipc_ffi_free(outPtr, outLen);
    ipc_ffi_free(metaPtr, 8);
    ipc_ffi_free(inPtr, input.length);
    return output;
  }

  destroy(): void {
    // Nothing to release: the module is dropped with this object.
  }

  private mem(): Uint8Array {
    return new Uint8Array(
      (this.instance.exports.memory as WebAssembly.Memory).buffer,
    );
  }
}

interface WasiFfiExports {
  memory: WebAssembly.Memory;
  ipc_ffi_alloc(len: number): number;
  ipc_ffi_free(ptr: number, len: number): void;
  ipc_ffi_entry(
    inPtr: number,
    inLen: number,
    outPtrOut: number,
    outLenOut: number,
  ): void;
}

/* eslint-disable camelcase */
function wasiShim(
  memory: () => Uint8Array,
  view: () => DataView,
  logger: (msg: string) => void,
) {
  const cryptoObj: Crypto = (globalThis as any).crypto;
  return {
    // Fill `len` bytes at `buf` with cryptographic randomness.
    random_get: (buf: number, len: number): number => {
      const bytes = new Uint8Array(len);
      cryptoObj.getRandomValues(bytes);
      memory().set(bytes, buf >>> 0);
      return 0;
    },
    // Gather the iovecs and surface them to the logger (Rust std println/panic writes go here).
    fd_write: (
      _fd: number,
      iovs: number,
      iovsLen: number,
      nwritten: number,
    ): number => {
      const dv = view();
      let written = 0;
      const chunks: Uint8Array[] = [];
      for (let i = 0; i < iovsLen; i++) {
        const ptr = dv.getUint32(iovs + i * 8, true);
        const len = dv.getUint32(iovs + i * 8 + 4, true);
        chunks.push(memory().slice(ptr, ptr + len));
        written += len;
      }
      dv.setUint32(nwritten, written, true);
      if (written > 0) {
        const buf = new Uint8Array(written);
        let o = 0;
        for (const c of chunks) {
          buf.set(c, o);
          o += c.length;
        }
        logger(new TextDecoder().decode(buf).replace(/\n$/, ""));
      }
      return 0;
    },
    // No environment is exposed to the module.
    environ_sizes_get: (countOut: number, sizeOut: number): number => {
      const dv = view();
      dv.setUint32(countOut, 0, true);
      dv.setUint32(sizeOut, 0, true);
      return 0;
    },
    environ_get: (): number => 0,
    clock_time_get: (
      _id: number,
      _precision: bigint,
      timeOut: number,
    ): number => {
      view().setBigUint64(timeOut, BigInt(Date.now()) * 1_000_000n, true);
      return 0;
    },
    proc_exit: (code: number): never => {
      throw new Error(`wasm proc_exit(${code})`);
    },
  };
}
/* eslint-enable camelcase */
