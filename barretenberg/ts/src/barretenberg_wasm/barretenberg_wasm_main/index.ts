import { type Worker } from 'worker_threads';
import { Remote } from 'comlink';
import { getNumCpu, getRemoteBarretenbergWasm, getSharedMemoryAvailable } from '../helpers/index.js';
import { createThreadWorker } from '../barretenberg_wasm_thread/factory/node/index.js';
import { type BarretenbergWasmThreadWorker } from '../barretenberg_wasm_thread/index.js';
import { BarretenbergWasmBase } from '../barretenberg_wasm_base/index.js';
import { HeapAllocator } from './heap_allocator.js';

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
  private useCustomLogger = false;

  // Pre-allocated scratch buffers for msgpack I/O to avoid malloc/free overhead
  private msgpackInputScratch: number = 0; // 8MB input buffer
  private msgpackOutputScratch: number = 0; // 8MB output buffer
  private readonly MSGPACK_SCRATCH_SIZE = 1024 * 1024 * 8; // 8MB

  public getNumThreads() {
    return this.workers.length + 1;
  }

  /**
   * Init as main thread. Spawn child threads.
   */
  public async init(
    module: WebAssembly.Module,
    threads = Math.min(getNumCpu(), BarretenbergWasmMain.MAX_THREADS),
    logger?: (msg: string) => void,
    initial = 35,
    maximum = this.getDefaultMaximumMemoryPages(),
  ) {
    // Track whether a custom logger was provided so workers know whether to postMessage logs
    this.useCustomLogger = logger !== undefined;
    this.logger = logger ?? (() => {});

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

    // Allocate dedicated msgpack scratch buffers (never freed, reused for all msgpack calls)
    this.msgpackInputScratch = this.call('bbmalloc', this.MSGPACK_SCRATCH_SIZE);
    this.msgpackOutputScratch = this.call('bbmalloc', this.MSGPACK_SCRATCH_SIZE);
    this.logger(
      `Allocated msgpack scratch buffers: ` +
        `input @ ${this.msgpackInputScratch}, output @ ${this.msgpackOutputScratch} (${this.MSGPACK_SCRATCH_SIZE} bytes each)`,
    );

    // Create worker threads. Create 1 less than requested, as main thread counts as a thread.
    if (threads > 1) {
      this.logger(`Creating ${threads} worker threads`);
      this.workers = await Promise.all(Array.from({ length: threads - 1 }).map(createThreadWorker));

      // Set up log message forwarding from workers to our logger (only if custom logger provided)
      if (this.useCustomLogger) {
        this.workers.forEach(worker => this.setupWorkerLogForwarding(worker));
      }

      this.remoteWasms = await Promise.all(this.workers.map(getRemoteBarretenbergWasm<BarretenbergWasmThreadWorker>));
      await Promise.all(this.remoteWasms.map(w => w.initThread(module, this.memory, this.useCustomLogger)));
    }
  }

  private getDefaultMaximumMemoryPages(): number {
    // iOS browser is very aggressive with memory. Check if running in browser and on iOS.
    // We at any rate expect the mobile iOS browser to kill us >=1GB, so we don't set a maximum higher than that.
    // Use `self` instead of `window` so this check also works inside Web Workers.
    if (typeof self !== 'undefined' && typeof self.navigator !== 'undefined' && /iPad|iPhone/.test(self.navigator.userAgent)) {
      return 2 ** 14;
    }
    return 2 ** 16;
  }

  /**
   * Set up forwarding of log messages from worker threads to our logger.
   * Workers post messages with { type: 'log', msg: string } which we intercept here.
   */
  private setupWorkerLogForwarding(worker: Worker) {
    const handler = (data: unknown) => {
      if (data && typeof data === 'object' && 'type' in data && data.type === 'log' && 'msg' in data) {
        this.logger(data.msg as string);
      }
    };

    // Node Workers use 'on' method, browser Workers use 'addEventListener'
    // The 'worker' variable is typed as Node's Worker, but at runtime in browser
    // it will be a browser Worker (due to browser_postprocess.sh import rewriting)
    if ('on' in worker && typeof worker.on === 'function') {
      // Node.js worker_threads Worker
      worker.on('message', handler);
    } else if ('addEventListener' in worker) {
      // Browser Web Worker
      (worker as unknown as globalThis.Worker).addEventListener('message', (event: MessageEvent) => {
        handler(event.data);
      });
    }
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
    const needsCustomInputBuffer = inputBuffer.length > this.MSGPACK_SCRATCH_SIZE;
    let inputPtr: number;

    if (needsCustomInputBuffer) {
      // Allocate temporary buffer for oversized input
      inputPtr = this.call('bbmalloc', inputBuffer.length);
    } else {
      // Use pre-allocated scratch buffer
      inputPtr = this.msgpackInputScratch;
    }

    // Write input to buffer
    this.writeMemory(inputPtr, inputBuffer);

    // Setup output scratch buffer with IN-OUT parameter pattern:
    // Reserve 8 bytes for metadata (pointer + size), rest is scratch data space
    const METADATA_SIZE = 8;
    const outputPtrLocation = this.msgpackOutputScratch;
    const outputSizeLocation = this.msgpackOutputScratch + 4;
    const scratchDataPtr = this.msgpackOutputScratch + METADATA_SIZE;
    const scratchDataSize = this.MSGPACK_SCRATCH_SIZE - METADATA_SIZE;

    // Get memory and create DataView for writing IN values
    let mem = this.getMemory();
    let view = new DataView(mem.buffer);

    // Write IN values: provide scratch buffer pointer and size to C++
    view.setUint32(outputPtrLocation, scratchDataPtr, true);
    view.setUint32(outputSizeLocation, scratchDataSize, true);

    // Call WASM
    this.call(cbind, inputPtr, inputBuffer.length, outputPtrLocation, outputSizeLocation);

    // Free custom input buffer if allocated
    if (needsCustomInputBuffer) {
      this.call('bbfree', inputPtr);
    }

    // Re-fetch memory after WASM call, as the buffer may have been detached if memory grew
    mem = this.getMemory();
    view = new DataView(mem.buffer);

    // Read OUT values: C++ returns actual buffer pointer and size
    const outputDataPtr = view.getUint32(outputPtrLocation, true);
    const outputSize = view.getUint32(outputSizeLocation, true);

    // Check if C++ used scratch (pointer unchanged) or allocated (pointer changed)
    const usedScratch = outputDataPtr === scratchDataPtr;

    // Copy output data from WASM memory
    const encodedResult = this.getMemorySlice(outputDataPtr, outputDataPtr + outputSize);

    // Only free if C++ allocated beyond scratch
    if (!usedScratch) {
      this.call('bbfree', outputDataPtr);
    }

    return encodedResult;
  }
}

/**
 * The comlink type that asyncifies the BarretenbergWasmMain api.
 */
export type BarretenbergWasmMainWorker = Remote<BarretenbergWasmMain>;
