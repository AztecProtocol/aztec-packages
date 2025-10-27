import { IMsgpackBackendAsync } from './interface.js';
import { createDebugLogger } from '../log/index.js';

/**
 * Emscripten backend with Address Sanitizer for debugging memory issues.
 *
 * WARNING: This backend is ONLY for debugging. ASAN builds are ~30x larger
 * and significantly slower than production WASI builds.
 *
 * Usage:
 * - Build ASAN WASM: ../cpp/bootstrap.sh build_emscripten_threads_asan
 * - Use this backend to detect buffer overflows, use-after-free, etc.
 * - Switch back to WASI backend for production
 */
export class BarretenbergEmscriptenBackend implements IMsgpackBackendAsync {
  private module: any;
  private heapU8: Uint8Array;
  private logger: (msg: string) => void;

  private constructor(module: any, logger: (msg: string) => void) {
    this.module = module;
    this.heapU8 = new Uint8Array(module.HEAPU8.buffer);
    this.logger = logger;
  }

  /**
   * Create and initialize an Emscripten backend with ASAN.
   *
   * @param wasmPath Path to the emscripten-generated .wasm file
   * @param jsPath Path to the emscripten-generated .js file
   * @param logger Optional logging function
   */
  static async new(
    wasmPath: string,
    jsPath: string,
    logger: (msg: string) => void = createDebugLogger('bb_emscripten'),
  ): Promise<BarretenbergEmscriptenBackend> {
    logger('Loading emscripten WASM with ASAN for debugging...');
    logger(`WASM path: ${wasmPath}`);
    logger(`JS path: ${jsPath}`);

    // Dynamically import the emscripten-generated JS module
    const createModule = (await import(jsPath)).default;

    // Fetch the WASM binary
    const wasmBinary = await fetch(wasmPath).then(r => r.arrayBuffer());
    logger(`Loaded WASM binary: ${wasmBinary.byteLength} bytes`);

    // Initialize the emscripten module
    const module = await createModule({
      wasmBinary,
      print: (text: string) => logger(`[WASM stdout] ${text}`),
      printErr: (text: string) => logger(`[WASM stderr] ${text}`),
      // Emscripten ASAN needs a lot of memory
      INITIAL_MEMORY: 256 * 1024 * 1024, // 256MB initial
      MAXIMUM_MEMORY: 2 * 1024 * 1024 * 1024, // 2GB max
    });

    logger('Emscripten module initialized successfully');
    logger('ASAN is active - memory errors will be reported');

    return new BarretenbergEmscriptenBackend(module, logger);
  }

  async call(inputBuffer: Uint8Array): Promise<Uint8Array> {
    // Allocate memory for input
    const inputPtr = this.module._malloc(inputBuffer.length);
    if (!inputPtr) {
      throw new Error('Failed to allocate memory for input');
    }

    try {
      // Copy input to WASM memory
      this.heapU8.set(inputBuffer, inputPtr);

      // Call bbapi function
      // The emscripten module exports bbapi which takes input ptr/size and returns output ptr/size
      const outputSizePtr = this.module._malloc(4); // uint32_t for output size
      if (!outputSizePtr) {
        throw new Error('Failed to allocate memory for output size');
      }

      try {
        // Call the exported bbapi function
        const outputPtr = this.module._bbapi_call(inputPtr, inputBuffer.length, outputSizePtr);

        if (!outputPtr) {
          throw new Error('bbapi call returned null');
        }

        // Read output size
        const outputSize = this.module.HEAPU32[outputSizePtr >> 2];

        // Copy output from WASM memory
        const output = new Uint8Array(outputSize);
        output.set(this.heapU8.subarray(outputPtr, outputPtr + outputSize));

        // Free output buffer (allocated by C++ code)
        this.module._free(outputPtr);

        return output;
      } finally {
        this.module._free(outputSizePtr);
      }
    } finally {
      this.module._free(inputPtr);
    }
  }

  async destroy(): Promise<void> {
    this.logger('Destroying emscripten backend');
    // Emscripten modules don't have explicit cleanup
    // Memory will be freed by the garbage collector
  }
}
