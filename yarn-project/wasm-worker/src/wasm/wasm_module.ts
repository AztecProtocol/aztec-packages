import { createDebugLogger, DebugLogger } from '@aztec/log';
import { Buffer } from 'buffer';
import { AsyncCallState } from './async_call_state.js';
import { MemoryFifo } from '../memory_fifo.js';
import { getEmptyWasiSdk } from './empty_wasi_sdk.js';
import { randomBytes } from 'crypto';

/**
 * WasmModule:
 *  Helper over a webassembly module.
 *  Assumes a few quirks.
 *  1) the module expects wasi_snapshot_preview1 with the methods from getEmptyWasiSdk
 *  2) of which the webassembly
 *  we instantiate only uses random_get (update this if more WASI sdk methods are needed)
 */
export class WasmModule {
  private memory!: WebAssembly.Memory;
  private heap!: Uint8Array;
  private instance!: WebAssembly.Instance;
  private mutexQ = new MemoryFifo<boolean>();
  private asyncCallState = new AsyncCallState();
  private debug: DebugLogger;

  /**
   * Create a wasm module and initialize it.
   * @param module the module as a WebAssembly.Module or a Buffer
   * @param wasmImportEnvFunc Linked to a module called "env". Functions implementations referenced from e.g. C++
   * @param loggerName optional, for debug logging
   */
  public static async new(
    module: WebAssembly.Module | Buffer,
    wasmImportEnvFunc: (module: WasmModule) => any,
    loggerName = 'wasm-worker',
  ) {
    const wasmModule = new WasmModule(module, loggerName);
    await wasmModule.init(wasmImportEnvFunc(wasmModule));
    return wasmModule;
  }

  /**
   * Create a wasm module. Should be followed by await init();
   * @param module the module as a WebAssembly.Module or a Buffer
   * @param wasmImportEnv Linked to a module called "env". Functions implementations referenced from e.g. C++
   * @param loggerName optional, for debug logging
   */
  constructor(private module: WebAssembly.Module | Buffer, loggerName = 'wasm-worker') {
    this.debug = createDebugLogger(loggerName);
    this.mutexQ.put(true);
  }

  /**
   * Initialize this wasm module.
   * @param wasmImportEnv Linked to a module called "env". Functions implementations referenced from e.g. C++
   * @param initial 20 pages by default. 20*2**16 > 1mb stack size plus other overheads.
   * @param maximum 8192 maximum by default. 512mb.
   */
  public async init(wasmImportEnv: any, initial = 20, maximum = 8192) {
    this.debug(
      `initial mem: ${initial} pages, ${(initial * 2 ** 16) / (1024 * 1024)}mb. max mem: ${maximum} pages, ${
        (maximum * 2 ** 16) / (1024 * 1024)
      }mb`,
    );
    this.memory = new WebAssembly.Memory({ initial, maximum });
    // Create a view over the memory buffer.
    // We do this once here, as webkit *seems* bugged out and actually shows this as new memory,
    // thus displaying double. It's only worse if we create views on demand. I haven't established yet if
    // the bug is also exasperating the termination on mobile due to "excessive memory usage". It could be
    // that the OS is actually getting an incorrect reading in the same way the memory profiler does...
    // The view will have to be recreated if the memory is grown. See getMemory().
    this.heap = new Uint8Array(this.memory.buffer);

    // We support the wasi 12 SDK, but only implement random_get
    /* eslint-disable camelcase */
    const importObj = {
      wasi_snapshot_preview1: {
        ...getEmptyWasiSdk(this.debug),
        random_get: (arr: number, length: number) => {
          arr = arr >>> 0;
          const heap = this.getMemory();
          const randomData = randomBytes(length);
          for (let i = arr; i < arr + length; ++i) {
            heap[i] = randomData[i - arr];
          }
        },
      },
      env: wasmImportEnv,
    };

    if (this.module instanceof WebAssembly.Module) {
      this.instance = await WebAssembly.instantiate(this.module, importObj);
    } else {
      const { instance } = await WebAssembly.instantiate(this.module, importObj);
      this.instance = instance;
    }

    this.asyncCallState.init(this.memory, this.call.bind(this), this.debug.bind(this));
  }

  public exports(): any {
    return this.instance.exports;
  }

  /**
   * When returning values from the WASM, use >>> operator to convert signed representation to unsigned representation.
   */
  public call(name: string, ...args: any) {
    if (!this.exports()[name]) {
      throw new Error(`WASM function ${name} not found.`);
    }
    try {
      return this.exports()[name](...args) >>> 0;
    } catch (err: any) {
      const message = `WASM function ${name} aborted, error: ${err}`;
      this.debug(message);
      this.debug(err.stack);
      throw new Error(message);
    }
  }

  /**
   * Uses asyncify to enable async callbacks into js.
   * https://kripken.github.io/blog/wasm/2019/07/16/asyncify.html
   */
  public async asyncCall(name: string, ...args: any) {
    if (this.asyncCallState.state) {
      throw new Error(`Can only handle one async call at a time: ${name}(${args})`);
    }
    return await this.asyncCallState.call(name, ...args);
  }

  private getMemory() {
    // If the memory is grown, our view over it will be lost. Recreate the view.
    if (this.heap.length === 0) {
      this.heap = new Uint8Array(this.memory.buffer);
    }
    return this.heap;
  }

  public memSize() {
    return this.getMemory().length;
  }

  public sliceMemory(start: number, end: number) {
    return this.getMemory().slice(start, end);
  }

  public transferToHeap(arr: Uint8Array, offset: number) {
    const mem = this.getMemory();
    for (let i = 0; i < arr.length; i++) {
      mem[i + offset] = arr[i];
    }
  }

  /**
   * When calling the wasm, sometimes a caller will require exclusive access over a series of calls.
   * e.g. When a result is written to address 0, one cannot have another caller writing to the same address via
   * transferToHeap before the result is read via sliceMemory.
   * acquire() gets a single token from a fifo. The caller must call release() to add the token back.
   */
  public async acquire() {
    await this.mutexQ.get();
  }

  public release() {
    if (this.mutexQ.length() !== 0) {
      throw new Error('Release called but not acquired.');
    }
    this.mutexQ.put(true);
  }
}
