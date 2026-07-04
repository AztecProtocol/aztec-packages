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
/** Scratch buffers grow to at least this, and in this granularity, to avoid re-alloc churn. */
const SCRATCH_GRANULARITY = 64 * 1024;

export class WasiModuleBackend implements IpcClientSync {
  /** Persistent 8-byte in-out slot `[dataPtr: u32, dataLen: u32]`, reused across calls. */
  private readonly metaPtr: number;
  // Persistent, growable input/output scratch — no per-call alloc/free in the steady state.
  private inPtr = 0;
  private inCap = 0;
  private outPtr = 0;
  private outCap = 0;

  private constructor(
    private readonly instance: WebAssembly.Instance,
    private readonly exports: WasiFfiExports,
  ) {
    this.metaPtr = exports.ipc_ffi_alloc(8);
  }

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
    const { ipc_ffi_entry, ipc_ffi_free } = this.exports;

    // Grow-and-reuse persistent scratch; both potential allocs happen before we touch memory.
    const inPtr = this.ensureInput(input.length);
    const outScratchPtr = this.ensureOutput(1);

    this.mem().set(input, inPtr);
    // Hand the wasm our output scratch (ptr, capacity) via the in-out metadata slot.
    const dvIn = this.view();
    dvIn.setUint32(this.metaPtr, outScratchPtr, true);
    dvIn.setUint32(this.metaPtr + 4, this.outCap, true);

    ipc_ffi_entry(inPtr, input.length, this.metaPtr, this.metaPtr + 4);

    // Re-view (the call may have grown memory), then read where the wasm put the response.
    const dvOut = this.view();
    const outDataPtr = dvOut.getUint32(this.metaPtr, true);
    const outLen = dvOut.getUint32(this.metaPtr + 4, true);
    const output = this.mem().slice(outDataPtr, outDataPtr + outLen);

    if (outDataPtr !== outScratchPtr) {
      // Response didn't fit the scratch: the wasm allocated. Free it and grow scratch for next time.
      ipc_ffi_free(outDataPtr, outLen);
      this.ensureOutput(outLen);
    }
    return output;
  }

  destroy(): void {
    const { ipc_ffi_free } = this.exports;
    ipc_ffi_free(this.metaPtr, 8);
    if (this.inPtr) ipc_ffi_free(this.inPtr, this.inCap);
    if (this.outPtr) ipc_ffi_free(this.outPtr, this.outCap);
    this.inPtr = this.outPtr = this.inCap = this.outCap = 0;
  }

  /** Ensure the input scratch holds `need` bytes (growing, retaining across calls). */
  private ensureInput(need: number): number {
    if (need > this.inCap) {
      if (this.inPtr) this.exports.ipc_ffi_free(this.inPtr, this.inCap);
      this.inCap = roundUp(need);
      this.inPtr = this.exports.ipc_ffi_alloc(this.inCap);
    }
    return this.inPtr;
  }

  /** Ensure the output scratch holds `need` bytes (growing, retaining across calls). */
  private ensureOutput(need: number): number {
    if (need > this.outCap) {
      if (this.outPtr) this.exports.ipc_ffi_free(this.outPtr, this.outCap);
      this.outCap = roundUp(need);
      this.outPtr = this.exports.ipc_ffi_alloc(this.outCap);
    }
    return this.outPtr;
  }

  private mem(): Uint8Array {
    return new Uint8Array(
      (this.instance.exports.memory as WebAssembly.Memory).buffer,
    );
  }

  private view(): DataView {
    return new DataView(
      (this.instance.exports.memory as WebAssembly.Memory).buffer,
    );
  }
}

function roundUp(n: number): number {
  return Math.max(
    SCRATCH_GRANULARITY,
    Math.ceil(n / SCRATCH_GRANULARITY) * SCRATCH_GRANULARITY,
  );
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
