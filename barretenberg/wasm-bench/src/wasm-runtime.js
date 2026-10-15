import pako from 'pako';

const WASM_PAGE_SIZE = 64 * 1024;
const MSGPACK_SCRATCH_SIZE = 8 * 1024 * 1024;

function randomBytes(length) {
  const out = new Uint8Array(length);
  globalThis.crypto.getRandomValues(out);
  return out;
}

function getMemoryView(memory) {
  return new Uint8Array(memory.buffer);
}

function stringFromMemory(memory, addr) {
  const mem = getMemoryView(memory);
  let end = addr >>> 0;
  while (mem[end] !== 0) {
    end++;
  }
  return new TextDecoder('ascii').decode(mem.slice(addr >>> 0, end));
}

export function createImportObject({ memory, logger = () => {}, envHardwareConcurrency = () => 1, threadSpawn }) {
  return {
    wasi_snapshot_preview1: {
      random_get(out, length) {
        getMemoryView(memory).set(randomBytes(length), out >>> 0);
      },
      clock_time_get(_clockId, _precision, out) {
        new DataView(memory.buffer).setBigUint64(out >>> 0, BigInt(Date.now()) * 1000000n, true);
      },
      proc_exit(code) {
        throw new Error(`WASI proc_exit(${code})`);
      },
    },
    wasi: {
      'thread-spawn': threadSpawn ?? (() => {
        throw new Error('WASM thread tried to spawn another thread');
      }),
    },
    env: {
      memory,
      env_hardware_concurrency: envHardwareConcurrency,
      logstr(addr) {
        const text = stringFromMemory(memory, addr);
        const mib = (memory.buffer.byteLength / (1024 * 1024)).toFixed(2);
        logger(`${text} (mem: ${mib}MiB)`);
      },
      throw_or_abort_impl(addr) {
        throw new Error(stringFromMemory(memory, addr));
      },
    },
  };
}

async function fetchWasmBytes(url, progress, { retries = 4, retryDelayMs = 500 } = {}) {
  const started = performance.now();
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, { cache: 'default' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const compressed = new Uint8Array(await response.arrayBuffer());
      progress?.('wasm_fetch', { url, bytes: compressed.byteLength, elapsedMs: performance.now() - started, attempt });
      const isGzip = compressed[0] === 0x1f && compressed[1] === 0x8b && compressed[2] === 0x08;
      return isGzip ? pako.ungzip(compressed) : compressed;
    } catch (error) {
      lastError = error;
      progress?.('wasm_fetch_retry', { url, attempt, message: error?.message ?? String(error) });
      if (attempt >= retries) break;
      await new Promise(resolve => setTimeout(resolve, retryDelayMs * Math.pow(2, attempt)));
    }
  }
  throw new Error(`Failed to fetch ${url} after ${retries + 1} attempts: ${lastError?.message ?? lastError}`);
}

function copyOut(memory, start, end) {
  return getMemoryView(memory).subarray(start >>> 0, end >>> 0).slice();
}

export class DirectBbWasm {
  constructor({ logger = () => {}, progress = () => {} } = {}) {
    this.logger = logger;
    this.progress = progress;
    this.instance = undefined;
    this.memory = undefined;
    this.threadWorkers = [];
    this.nextThreadId = 1;
    this.nextWorker = 0;
    this.msgpackInputScratch = 0;
    this.msgpackOutputScratch = 0;
  }

  async init({ threads = 1, wasmBaseUrl = '/wasm', memInitialPages = 35, memMaxPages } = {}) {
    const requestedThreads = Math.max(1, Number(threads) || 1);
    const shared = requestedThreads > 1;
    if (shared && (typeof SharedArrayBuffer === 'undefined' || !globalThis.crossOriginIsolated)) {
      throw new Error('SharedArrayBuffer requires crossOriginIsolated=true for threaded wasm.');
    }

    const wasmName = shared ? 'barretenberg-threads.wasm.gz' : 'barretenberg.wasm.gz';
    const wasmUrl = `${wasmBaseUrl.replace(/\/$/, '')}/${wasmName}`;
    const bytes = await fetchWasmBytes(wasmUrl, this.progress);
    const compileStarted = performance.now();
    const module = await WebAssembly.compile(bytes);
    this.progress('wasm_compile', { elapsedMs: performance.now() - compileStarted, bytes: bytes.byteLength });

    const maximum = memMaxPages ?? (isIos() ? 2 ** 14 : 2 ** 16);
    this.memory = new WebAssembly.Memory({ initial: memInitialPages, maximum, shared });

    const imports = createImportObject({
      memory: this.memory,
      logger: this.logger,
      envHardwareConcurrency: () => this.threadWorkers.length + 1,
      threadSpawn: arg => this.spawnThread(arg),
    });

    const instantiateStarted = performance.now();
    this.instance = await WebAssembly.instantiate(module, imports);
    this.call('_initialize');
    this.msgpackInputScratch = this.call('bbmalloc', MSGPACK_SCRATCH_SIZE);
    this.msgpackOutputScratch = this.call('bbmalloc', MSGPACK_SCRATCH_SIZE);
    this.progress('wasm_instantiate', {
      elapsedMs: performance.now() - instantiateStarted,
      threads: requestedThreads,
      shared,
      memoryInitialMiB: (memInitialPages * WASM_PAGE_SIZE) / (1024 * 1024),
      memoryMaxMiB: (maximum * WASM_PAGE_SIZE) / (1024 * 1024),
    });

    if (requestedThreads > 1) {
      await this.initThreads(module, requestedThreads - 1);
    }
  }

  async initThreads(module, count) {
    const workers = [];
    for (let i = 0; i < count; i++) {
      const worker = new Worker(new URL('./thread-worker.js', import.meta.url), { type: 'module' });
      workers.push(worker);
      await new Promise((resolve, reject) => {
        const onMessage = event => {
          if (event.data?.type === 'ready') {
            cleanup();
            resolve();
          } else if (event.data?.type === 'log') {
            this.logger(event.data.message);
          } else if (event.data?.type === 'error') {
            cleanup();
            reject(new Error(event.data.message));
          }
        };
        const onError = event => {
          cleanup();
          reject(event.error ?? new Error(event.message));
        };
        const cleanup = () => {
          worker.removeEventListener('message', onMessage);
          worker.removeEventListener('error', onError);
        };
        worker.addEventListener('message', onMessage);
        worker.addEventListener('error', onError);
        worker.postMessage({ type: 'init', module, memory: this.memory });
      });
    }
    this.threadWorkers = workers;
    this.progress('thread_workers_ready', { workers: workers.length });
  }

  spawnThread(arg) {
    if (this.threadWorkers.length === 0) {
      throw new Error('WASM requested a worker thread, but no thread workers are available.');
    }
    const id = this.nextThreadId++;
    const worker = this.threadWorkers[this.nextWorker++ % this.threadWorkers.length];
    worker.postMessage({ type: 'run', id, arg: arg >>> 0 });
    return id;
  }

  exports() {
    if (!this.instance) {
      throw new Error('WASM is not initialized.');
    }
    return this.instance.exports;
  }

  call(name, ...args) {
    const fn = this.exports()[name];
    if (typeof fn !== 'function') {
      throw new Error(`WASM function ${name} not found.`);
    }
    return fn(...args) >>> 0;
  }

  cbindCall(inputBuffer) {
    if (!this.memory) {
      throw new Error('WASM memory is not initialized.');
    }

    const needsCustomInputBuffer = inputBuffer.length > MSGPACK_SCRATCH_SIZE;
    const inputPtr = needsCustomInputBuffer ? this.call('bbmalloc', inputBuffer.length) : this.msgpackInputScratch;
    getMemoryView(this.memory).set(inputBuffer, inputPtr);

    const metadataSize = 8;
    const outputPtrLocation = this.msgpackOutputScratch;
    const outputSizeLocation = this.msgpackOutputScratch + 4;
    const scratchDataPtr = this.msgpackOutputScratch + metadataSize;
    const scratchDataSize = MSGPACK_SCRATCH_SIZE - metadataSize;
    let view = new DataView(this.memory.buffer);
    view.setUint32(outputPtrLocation, scratchDataPtr, true);
    view.setUint32(outputSizeLocation, scratchDataSize, true);

    this.call('bbapi', inputPtr, inputBuffer.length, outputPtrLocation, outputSizeLocation);

    if (needsCustomInputBuffer) {
      this.call('bbfree', inputPtr);
    }

    view = new DataView(this.memory.buffer);
    const outputDataPtr = view.getUint32(outputPtrLocation, true);
    const outputSize = view.getUint32(outputSizeLocation, true);
    const encodedResult = copyOut(this.memory, outputDataPtr, outputDataPtr + outputSize);
    if (outputDataPtr !== scratchDataPtr) {
      this.call('bbfree', outputDataPtr);
    }
    return encodedResult;
  }

  async destroy() {
    for (const worker of this.threadWorkers) {
      worker.postMessage({ type: 'destroy' });
      worker.terminate();
    }
    this.threadWorkers = [];
  }
}

function isIos() {
  return typeof navigator !== 'undefined' && /iPad|iPhone/.test(navigator.userAgent);
}
