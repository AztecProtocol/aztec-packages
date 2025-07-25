import { type Worker } from 'worker_threads';
import { Remote } from 'comlink';
import { getNumCpu, getRemoteBarretenbergWasm, getSharedMemoryAvailable } from '../helpers/index.js';
import { createThreadWorker } from '../barretenberg_wasm_thread/factory/node/index.js';
import { type BarretenbergWasmThreadWorker } from '../barretenberg_wasm_thread/index.js';
import { BarretenbergWasmBase } from '../barretenberg_wasm_base/index.js';
import { HeapAllocator } from './heap_allocator.js';
import { createDebugLogger } from '../../log/index.js';

/**
 * This is the "main thread" implementation of BarretenbergWasm.
 * It spawns a bunch of "child thread" implementations.
 * In a browser context, this still runs on a worker, as it will block waiting on child threads.
 */
export class BarretenbergWasmMain extends BarretenbergWasmBase {
  static MAX_THREADS = 32;
  private workers: Worker[] = [];
  private remoteWasms: BarretenbergWasmThreadWorker[] = [];
  private nextWorker = 0;
  private nextThreadId = 1;

  public getNumThreads() {
    return this.workers.length + 1;
  }

  /**
   * Init as main thread. Spawn child threads.
   */
  public async init(
    module: WebAssembly.Module,
    threads = Math.min(getNumCpu(), BarretenbergWasmMain.MAX_THREADS),
    logger: (msg: string) => void = createDebugLogger('bb_wasm'),
    initial = 32,
    maximum = this.getDefaultMaximumMemoryPages(),
  ) {
    this.logger = logger;

    const initialMb = (initial * 2 ** 16) / (1024 * 1024);
    const maxMb = (maximum * 2 ** 16) / (1024 * 1024);
    const shared = getSharedMemoryAvailable();

    this.logger(
      `Initializing bb wasm: initial memory ${initial} pages ${initialMb}MiB; ` +
        `max memory: ${maximum} pages, ${maxMb}MiB; ` +
        `threads: ${threads}; shared memory: ${shared}`,
    );

    this.memory = new WebAssembly.Memory({ initial, maximum, shared });

    const instance = await WebAssembly.instantiate(module, this.getImportObj(this.memory));

    this.instance = instance;

    // Init all global/static data.
    this.call('_initialize');

    // Create worker threads. Create 1 less than requested, as main thread counts as a thread.
    if (threads > 1) {
      this.logger(`Creating ${threads} worker threads`);
      this.workers = await Promise.all(Array.from({ length: threads - 1 }).map(createThreadWorker));
      this.remoteWasms = await Promise.all(this.workers.map(getRemoteBarretenbergWasm<BarretenbergWasmThreadWorker>));
      await Promise.all(this.remoteWasms.map(w => w.initThread(module, this.memory)));
    }
  }

  private getDefaultMaximumMemoryPages(): number {
    // iOS browser is very aggressive with memory. Check if running in browser and on iOS
    // We at any rate expect the mobile iOS browser to kill us >=1GB, so we don't set a maximum higher than that.
    if (typeof window !== 'undefined' && /iPad|iPhone/.test(navigator.userAgent)) {
      return 2 ** 14;
    }
    return 2 ** 16;
  }

  /**
   * Called on main thread. Signals child threads to gracefully exit.
   */
  public async destroy() {
    await Promise.all(this.workers.map(w => w.terminate()));
  }

  protected getImportObj(memory: WebAssembly.Memory) {
    const baseImports = super.getImportObj(memory);

    /* eslint-disable camelcase */
    return {
      ...baseImports,
      wasi: {
        'thread-spawn': (arg: number) => {
          arg = arg >>> 0;
          const id = this.nextThreadId++;
          const worker = this.nextWorker++ % this.remoteWasms.length;
          // this.logger(`spawning thread ${id} on worker ${worker} with arg ${arg >>> 0}`);
          this.remoteWasms[worker].call('wasi_thread_start', id, arg).catch(this.logger);
          // this.remoteWasms[worker].postMessage({ msg: 'thread', data: { id, arg } });
          return id;
        },
      },
      env: {
        ...baseImports.env,
        env_hardware_concurrency: () => {
          // If there are no workers (we're already running as a worker, or the main thread requested no workers)
          // then we return 1, which should cause any algos using threading to just not create a thread.
          return this.remoteWasms.length + 1;
        },
      },
    };
    /* eslint-enable camelcase */
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

  private getOutputArgs(outLens: (number | undefined)[], outPtrs: number[], alloc: HeapAllocator) {
    return outLens.map((len, i) => {
      if (len) {
        return this.getMemorySlice(outPtrs[i], outPtrs[i] + len);
      }
      const slice = this.getMemorySlice(outPtrs[i], outPtrs[i] + 4);
      const ptr = new DataView(slice.buffer, slice.byteOffset, slice.byteLength).getUint32(0, true);

      // Add our heap buffer to the dealloc list.
      alloc.addOutputPtr(ptr);

      // The length will be found in the first 4 bytes of the buffer, big endian. See to_heap_buffer.
      const lslice = this.getMemorySlice(ptr, ptr + 4);
      const length = new DataView(lslice.buffer, lslice.byteOffset, lslice.byteLength).getUint32(0, false);

      return this.getMemorySlice(ptr + 4, ptr + 4 + length);
    });
  }

  cbindCall(cbind: string, inputBuffer: Uint8Array): any {
    const outputSizePtr = this.call('bbmalloc', 4);
    const outputMsgpackPtr = this.call('bbmalloc', 4);

    const inputPtr = this.call('bbmalloc', inputBuffer.length);
    this.writeMemory(inputPtr, inputBuffer);
    this.call(cbind, inputPtr, inputBuffer.length, outputMsgpackPtr, outputSizePtr);

    const readPtr32 = (ptr32: number) => {
      const dataView = new DataView(this.getMemorySlice(ptr32, ptr32 + 4).buffer);
      return dataView.getUint32(0, true);
    };

    const encodedResult = this.getMemorySlice(
      readPtr32(outputMsgpackPtr),
      readPtr32(outputMsgpackPtr) + readPtr32(outputSizePtr),
    );
    this.call('bbfree', inputPtr);
    this.call('bbfree', outputSizePtr);
    this.call('bbfree', outputMsgpackPtr);
    return encodedResult;
  }
}

/**
 * The comlink type that asyncifies the BarretenbergWasmMain api.
 */
export type BarretenbergWasmMainWorker = Remote<BarretenbergWasmMain>;
