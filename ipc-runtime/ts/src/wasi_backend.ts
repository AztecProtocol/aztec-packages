import type { IpcClientAsync, IpcClientSync } from "./types.js";

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

/**
 * Routes an outbound `host_call` from a wasm module to its target service. `target` selects which
 * declared dependency (the wasm passes a small index); `req`/return are that service's opaque msgpack
 * frame. Typically forwards to an ipc-runtime client (`(target, req) => client.call(req)`) or an
 * in-process handler. Runs *off* the wasm stack — it may await freely.
 */
export type HostCall = (target: number, req: Uint8Array) => Promise<Uint8Array>;

/** Asyncify runtime states, matching Binaryen's `--asyncify` instrumentation. */
const ASYNCIFY_NORMAL = 0;
const ASYNCIFY_UNWINDING = 1;

/**
 * Async host for a WASI compute module that additionally makes **blocking outbound calls** to other
 * services via a `host_call` import, suspended with Binaryen's Asyncify (built with
 * `wasm-opt --asyncify --pass-arg=asyncify-imports@<module>.host_call --pass-arg=asyncify-ignore-indirect`).
 *
 * From the module's view `host_call` blocks; here it unwinds the wasm stack back to JS, we `await` the
 * (async) resolution via {@link HostCall}, then rewind and resume — on the **main thread, no
 * SharedArrayBuffer**. JSPI is a future drop-in replacement for the Asyncify pass; this driver is the
 * interim. Because JS cannot block on a promise, {@link call} is async (`IpcClientAsync`); the same
 * generated `<Service>Api` runs against it as `AsyncApi`.
 *
 * The `host_call` import ABI is `(target: u32, req_ptr, req_len, resp_ptr_out, resp_len_out)`; the
 * module reads the response bytes from `*resp_ptr_out`/`*resp_len_out` after the call returns.
 *
 * Calls are serialized: the module has one Asyncify stack and one set of scratch buffers, so an
 * overlapping {@link call} would corrupt an in-flight suspension. Concurrent callers are queued.
 */
export class WasiAsyncBackend implements IpcClientAsync {
  private readonly metaPtr: number;
  private inPtr = 0;
  private inCap = 0;
  private outPtr = 0;
  private outCap = 0;

  // Asyncify unwind/rewind scratch: an 8-byte control struct [cur, end] followed by stack space.
  private readonly asyncifyData: number;
  private static readonly ASYNCIFY_STACK = 64 * 1024;

  // Reusable buffer handed back to the module as a `host_call` response (grows as needed).
  private respPtr = 0;
  private respCap = 0;

  // Captured across a suspend: the pending request and the target it addresses.
  private pendingReq: Uint8Array = new Uint8Array(0);
  private pendingTarget = 0;
  private pendingResp: Uint8Array = new Uint8Array(0);

  // Serializes overlapping call()s onto the module's single Asyncify stack.
  private queue: Promise<unknown> = Promise.resolve();

  private constructor(
    private readonly instance: WebAssembly.Instance,
    private readonly exports: WasiAsyncFfiExports,
  ) {
    this.metaPtr = exports.ipc_ffi_alloc(8);
    this.asyncifyData = exports.ipc_ffi_alloc(
      8 + WasiAsyncBackend.ASYNCIFY_STACK,
    );
  }

  /**
   * Instantiate an Asyncify'd wasip1 module. `onHostCall` resolves the module's outbound requests.
   */
  static async create(
    wasm: BufferSource | WebAssembly.Module,
    onHostCall: HostCall,
    hostModule = "acvm_host",
    logger: (msg: string) => void = () => {},
  ): Promise<WasiAsyncBackend> {
    let inst: WebAssembly.Instance | undefined;
    const memory = () =>
      new Uint8Array((inst!.exports.memory as WebAssembly.Memory).buffer);
    const view = () =>
      new DataView((inst!.exports.memory as WebAssembly.Memory).buffer);

    // Forward-declared so the import closure can reach the constructed backend for its buffers/state.
    let self: WasiAsyncBackend | undefined;
    const hostCall = (
      target: number,
      reqPtr: number,
      reqLen: number,
      respPtrOut: number,
      respLenOut: number,
    ) => self!.onHostCallImport(target, reqPtr, reqLen, respPtrOut, respLenOut);

    const imports = {
      wasi_snapshot_preview1: wasiShim(memory, view, logger),
      [hostModule]: { host_call: hostCall },
    };
    const source =
      wasm instanceof WebAssembly.Module
        ? await WebAssembly.instantiate(wasm, imports)
        : (await WebAssembly.instantiate(wasm, imports)).instance;
    inst =
      source instanceof WebAssembly.Instance
        ? source
        : (source as WebAssembly.WebAssemblyInstantiatedSource).instance;

    self = new WasiAsyncBackend(
      inst,
      inst.exports as unknown as WasiAsyncFfiExports,
    );
    self.onHostCall = onHostCall;
    return self;
  }

  private onHostCall: HostCall = async () => new Uint8Array(0);

  async call(input: Uint8Array): Promise<Uint8Array> {
    // Chain onto the queue so overlapping calls don't share the Asyncify stack mid-suspend.
    const run = this.queue.then(() => this.callExclusive(input));
    // Keep the queue alive regardless of this call's outcome.
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async callExclusive(input: Uint8Array): Promise<Uint8Array> {
    const ex = this.exports;
    const inPtr = this.ensureInput(input.length);
    const outScratchPtr = this.ensureOutput(1);

    this.mem().set(input, inPtr);
    const metaIn = this.view();
    metaIn.setUint32(this.metaPtr, outScratchPtr, true);
    metaIn.setUint32(this.metaPtr + 4, this.outCap, true);

    // Fresh top-level entry: reset the Asyncify stack pointer to the region start.
    const ctrl = this.view();
    ctrl.setUint32(this.asyncifyData, this.asyncifyData + 8, true);
    ctrl.setUint32(
      this.asyncifyData + 4,
      this.asyncifyData + 8 + WasiAsyncBackend.ASYNCIFY_STACK,
      true,
    );

    ex.ipc_ffi_entry(inPtr, input.length, this.metaPtr, this.metaPtr + 4);
    while (ex.asyncify_get_state() === ASYNCIFY_UNWINDING) {
      ex.asyncify_stop_unwind();
      // Resolve off the wasm stack — genuinely async (IPC, promise, etc.).
      this.pendingResp = await this.onHostCall(
        this.pendingTarget,
        this.pendingReq,
      );
      ex.asyncify_start_rewind(this.asyncifyData);
      ex.ipc_ffi_entry(inPtr, input.length, this.metaPtr, this.metaPtr + 4);
    }

    const metaOut = this.view();
    const outDataPtr = metaOut.getUint32(this.metaPtr, true);
    const outLen = metaOut.getUint32(this.metaPtr + 4, true);
    const output = this.mem().slice(outDataPtr, outDataPtr + outLen);
    if (outDataPtr !== outScratchPtr) {
      ex.ipc_ffi_free(outDataPtr, outLen);
      this.ensureOutput(outLen);
    }
    return output;
  }

  /**
   * The `host_call` import. First (NORMAL) hit: capture the request and begin unwinding to the driver.
   * On the rewind pass: stop the rewind and hand back the resolved response via the out-pointers.
   */
  private onHostCallImport(
    target: number,
    reqPtr: number,
    reqLen: number,
    respPtrOut: number,
    respLenOut: number,
  ): void {
    const ex = this.exports;
    if (ex.asyncify_get_state() === ASYNCIFY_NORMAL) {
      this.pendingTarget = target;
      this.pendingReq = this.mem().slice(reqPtr, reqPtr + reqLen);
      ex.asyncify_start_unwind(this.asyncifyData);
      return;
    }
    ex.asyncify_stop_rewind();
    const resp = this.pendingResp;
    if (resp.length > this.respCap) {
      if (this.respPtr) ex.ipc_ffi_free(this.respPtr, this.respCap);
      this.respCap = roundUp(resp.length);
      this.respPtr = ex.ipc_ffi_alloc(this.respCap);
    }
    this.mem().set(resp, this.respPtr);
    const dv = this.view();
    dv.setUint32(respPtrOut, this.respPtr, true);
    dv.setUint32(respLenOut, resp.length, true);
  }

  async destroy(): Promise<void> {
    const ex = this.exports;
    ex.ipc_ffi_free(this.metaPtr, 8);
    ex.ipc_ffi_free(this.asyncifyData, 8 + WasiAsyncBackend.ASYNCIFY_STACK);
    if (this.inPtr) ex.ipc_ffi_free(this.inPtr, this.inCap);
    if (this.outPtr) ex.ipc_ffi_free(this.outPtr, this.outCap);
    if (this.respPtr) ex.ipc_ffi_free(this.respPtr, this.respCap);
    this.inPtr = this.outPtr = this.respPtr = 0;
    this.inCap = this.outCap = this.respCap = 0;
  }

  private ensureInput(need: number): number {
    if (need > this.inCap) {
      if (this.inPtr) this.exports.ipc_ffi_free(this.inPtr, this.inCap);
      this.inCap = roundUp(need);
      this.inPtr = this.exports.ipc_ffi_alloc(this.inCap);
    }
    return this.inPtr;
  }

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

interface WasiAsyncFfiExports extends WasiFfiExports {
  asyncify_get_state(): number;
  asyncify_start_unwind(dataPtr: number): void;
  asyncify_stop_unwind(): void;
  asyncify_start_rewind(dataPtr: number): void;
  asyncify_stop_rewind(): void;
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
