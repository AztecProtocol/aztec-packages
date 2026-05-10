/**
 * Thin Emscripten loader for barretenberg's wasm artifacts.
 *
 * Emscripten emits a JS glue (`barretenberg.js`) plus a sibling
 * `barretenberg.wasm` and, when pthreads are enabled, a
 * `barretenberg.worker.mjs`. The glue handles:
 *   - WebAssembly.Module compilation + instantiation
 *   - pthread worker spawning (PTHREAD_POOL_SIZE / Module.pthreadPoolSize)
 *   - memory growth + thread-safe heap views
 *
 * The class below exposes the same surface bb.js consumed under the previous
 * hand-rolled worker harness: `init`, `call`, `cbindCall`, `writeMemory`,
 * `getMemorySlice`, `getMemory`, `destroy`. `Barretenberg.new({ threads: N })`
 * forwards `N` to Emscripten's `Module({ pthreadPoolSize: N })`.
 */

import type { Remote } from 'comlink';
import { HeapAllocator } from './heap_allocator.js';

type EmscriptenModule = {
  HEAPU8: Uint8Array;
  _bbmalloc: (size: number) => number;
  _bbfree: (ptr: number) => void;
  ccall(ident: string, returnType: string | null, argTypes: string[], args: any[]): any;
  cwrap(ident: string, returnType: string | null, argTypes: string[]): (...args: any[]) => any;
  // Emscripten exposes WASM_EXPORT functions as Module._<name>.
  [k: string]: any;
};

type EmscriptenFactory = (init?: Record<string, any>) => Promise<EmscriptenModule>;

async function loadEmscriptenFactory(wasmPath?: string): Promise<EmscriptenFactory> {
  // The packaged glue lives next to the wasm artifact at
  // `<dest>/<flavor>/barretenberg_wasm/barretenberg.js`. In Node we resolve
  // via import.meta.url; tests can override via `wasmPath` (which points at
  // the .wasm gzip; the glue lives next to it).
  let glueUrl: string;
  if (wasmPath) {
    const dir = wasmPath.split('/').slice(0, -1).join('/') || '.';
    glueUrl = `${dir}/barretenberg.js`;
  } else {
    // The build output places this file alongside the glue.
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - ESM-only `import.meta.url`.
    const here = new URL('.', import.meta.url);
    glueUrl = new URL('./barretenberg.js', here).href;
  }
  const mod = (await import(/* webpackIgnore: true */ glueUrl)) as { default: EmscriptenFactory };
  return mod.default;
}

export class BarretenbergWasmMain {
  static MAX_THREADS = 32;

  protected module!: EmscriptenModule;
  protected logger: (msg: string) => void = () => {};
  private threads = 1;
  private destroyed = false;

  // Pre-allocated scratch buffers for msgpack I/O to avoid malloc/free overhead
  private msgpackInputScratch = 0;
  private msgpackOutputScratch = 0;
  private readonly MSGPACK_SCRATCH_SIZE = 1024 * 1024 * 8; // 8 MiB

  public getNumThreads(): number {
    return this.threads;
  }

  /**
   * Initialise the wasm module.
   *
   * Signature is preserved from the previous custom worker harness so
   * `Barretenberg.new({ threads: N })` keeps working without changes to the
   * higher-level backend code.
   *
   * - `module`: ignored. Emscripten's glue compiles its own bundled wasm.
   *   Kept in the signature so the existing call sites in `wasm.ts` and
   *   `index.test.ts` link without further churn.
   * - `threads`: forwarded to Emscripten as `pthreadPoolSize`.
   * - `logger`: forwarded as `Module.print` / `Module.printErr`.
   * - `unref`: ignored under Emscripten (pthread workers are unref'd by the
   *   runtime when the module is `.destroy()`-ed).
   *
   * INITIAL_MEMORY / MAXIMUM_MEMORY are NOT runtime overrides under
   * Emscripten with MODULARIZE=1 -- they are link-time settings baked into
   * the wasm binary's memory section. The factory's `init` argument silently
   * ignores them. To change INITIAL_MEMORY, edit the toolchain
   * (cmake/toolchains/wasm-emscripten.cmake) and rebuild. We deliberately
   * do not accept these as parameters here so callers cannot mistakenly
   * believe they are wired through.
   */
  public async init(
    _module: unknown,
    threads: number = Math.min(BarretenbergWasmMain.MAX_THREADS, 32),
    logger?: (msg: string) => void,
    _unref = false,
    wasmPath?: string,
  ): Promise<void> {
    this.logger = logger ?? (() => {});
    this.threads = Math.max(1, Math.min(threads, BarretenbergWasmMain.MAX_THREADS));

    const factory = await loadEmscriptenFactory(wasmPath);
    // Emscripten 4.x runtime overrides on the Module object are camelCase
    // (matches `Module['pthreadPoolSize']` in upstream `library_pthread.js`
    // and `src/preamble.js`). Pinning the key name wrong silently falls
    // back to the link-time default (16 workers) -- which would make
    // `threads: 4` mean "16 workers" and warp the perf gate.
    this.module = await factory({
      pthreadPoolSize: this.threads,
      print: this.logger,
      printErr: this.logger,
      noExitRuntime: false,
    });

    this.msgpackInputScratch = this.module._bbmalloc(this.MSGPACK_SCRATCH_SIZE);
    this.msgpackOutputScratch = this.module._bbmalloc(this.MSGPACK_SCRATCH_SIZE);
    this.logger(
      `Allocated msgpack scratch buffers: ` +
        `input @ ${this.msgpackInputScratch}, output @ ${this.msgpackOutputScratch} ` +
        `(${this.MSGPACK_SCRATCH_SIZE} bytes each)`,
    );
  }

  public exports(): EmscriptenModule {
    return this.module;
  }

  public call(name: string, ...args: any[]): number {
    if (this.destroyed) {
      throw new Error(`WASM call '${name}' after destroy()`);
    }
    const fn = (this.module as any)[`_${name}`];
    if (!fn) {
      throw new Error(`WASM function ${name} not found.`);
    }
    try {
      return (fn(...args) as number) >>> 0;
    } catch (err: any) {
      const message = `WASM function ${name} aborted, error: ${err}`;
      this.logger(message);
      if (err && err.stack) {
        this.logger(err.stack);
      }
      throw err;
    }
  }

  public memSize(): number {
    return this.module.HEAPU8.length;
  }

  public getMemorySlice(start: number, end: number): Uint8Array {
    return this.module.HEAPU8.subarray(start, end).slice();
  }

  public writeMemory(offset: number, arr: Uint8Array): void {
    this.module.HEAPU8.set(arr, offset);
  }

  public getMemory(): Uint8Array {
    return this.module.HEAPU8;
  }

  /**
   * Tear the module down. Frees scratch buffers, terminates Emscripten's
   * pthread pool, and lets Node exit when there are no other handles.
   */
  public async destroy(): Promise<void> {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    try {
      if (this.msgpackInputScratch) {
        this.module._bbfree(this.msgpackInputScratch);
      }
      if (this.msgpackOutputScratch) {
        this.module._bbfree(this.msgpackOutputScratch);
      }
    } catch {
      /* swallow: tearing down anyway */
    }
    // Emscripten exposes `PThread.terminateAllThreads()` for pthread pool cleanup.
    const pthread = (this.module as any).PThread;
    if (pthread && typeof pthread.terminateAllThreads === 'function') {
      try {
        pthread.terminateAllThreads();
      } catch {
        /* ditto */
      }
    }
  }

  callWasmExport(funcName: string, inArgs: (Uint8Array | number)[], outLens: (number | undefined)[]) {
    const alloc = new HeapAllocator(this);
    const inPtrs = alloc.getInputs(inArgs);
    const outPtrs = alloc.getOutputPtrs(outLens);
    this.call(funcName, ...inPtrs, ...outPtrs);
    const outArgs = this.getOutputArgs(outLens, outPtrs, alloc);
    alloc.freeAll();
    return outArgs;
  }

  private getOutputArgs(outLens: (number | undefined)[], outPtrs: number[], alloc: HeapAllocator): Uint8Array[] {
    return outLens.map((len, i) => {
      if (len) {
        return this.getMemorySlice(outPtrs[i], outPtrs[i] + len);
      }
      const slice = this.getMemorySlice(outPtrs[i], outPtrs[i] + 4);
      const ptr = new DataView(slice.buffer, slice.byteOffset, slice.byteLength).getUint32(0, true);

      // Add our heap buffer to the dealloc list.
      alloc.addOutputPtr(ptr);

      // The length will be found in the first 4 bytes of the buffer, big endian.
      const lslice = this.getMemorySlice(ptr, ptr + 4);
      const length = new DataView(lslice.buffer, lslice.byteOffset, lslice.byteLength).getUint32(0, false);

      return this.getMemorySlice(ptr + 4, ptr + 4 + length);
    });
  }

  cbindCall(cbind: string, inputBuffer: Uint8Array): Uint8Array {
    const needsCustomInputBuffer = inputBuffer.length > this.MSGPACK_SCRATCH_SIZE;
    let inputPtr: number;

    if (needsCustomInputBuffer) {
      inputPtr = this.call('bbmalloc', inputBuffer.length);
    } else {
      inputPtr = this.msgpackInputScratch;
    }

    this.writeMemory(inputPtr, inputBuffer);

    const METADATA_SIZE = 8;
    const outputPtrLocation = this.msgpackOutputScratch;
    const outputSizeLocation = this.msgpackOutputScratch + 4;
    const scratchDataPtr = this.msgpackOutputScratch + METADATA_SIZE;
    const scratchDataSize = this.MSGPACK_SCRATCH_SIZE - METADATA_SIZE;

    let mem = this.getMemory();
    let view = new DataView(mem.buffer);

    view.setUint32(outputPtrLocation, scratchDataPtr, true);
    view.setUint32(outputSizeLocation, scratchDataSize, true);

    this.call(cbind, inputPtr, inputBuffer.length, outputPtrLocation, outputSizeLocation);

    if (needsCustomInputBuffer) {
      this.call('bbfree', inputPtr);
    }

    // Re-fetch memory after WASM call -- the buffer can be detached after a memory.grow.
    mem = this.getMemory();
    view = new DataView(mem.buffer);

    const outputDataPtr = view.getUint32(outputPtrLocation, true);
    const outputSize = view.getUint32(outputSizeLocation, true);

    const usedScratch = outputDataPtr === scratchDataPtr;

    const encodedResult = this.getMemorySlice(outputDataPtr, outputDataPtr + outputSize);

    if (!usedScratch) {
      this.call('bbfree', outputDataPtr);
    }

    return encodedResult;
  }
}

/**
 * The comlink type that asyncifies the BarretenbergWasmMain api. Retained for
 * source compatibility with `wasm.ts` and downstream consumers; under the
 * Emscripten loader the same class can be used directly without comlink, but
 * `BarretenbergWasmAsyncBackend` still wraps it via comlink when running
 * inside a Node worker_threads worker for the `useWorker: true` path.
 */
export type BarretenbergWasmMainWorker = Remote<BarretenbergWasmMain>;
