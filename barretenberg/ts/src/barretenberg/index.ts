import { Crs, GrumpkinCrs } from '../crs/index.js';
import { createDebugLogger } from '../log/index.js';
import { AsyncApi } from '../cbind/generated/async.js';
import { SyncApi } from '../cbind/generated/sync.js';
import { IMsgpackBackendSync, IMsgpackBackendAsync } from '../backend/interface.js';
import { BarretenbergNativeSyncBackend, BarretenbergNativeAsyncBackend } from '../backend/native.js';
import { BarretenbergNativeSocketAsyncBackend } from '../backend/native_socket.js';
import { BarretenbergWasmSyncBackend, BarretenbergWasmAsyncBackend } from '../backend/wasm.js';
import { findBbBinary } from '../backend/platform.js';

export { UltraHonkBackend, UltraHonkVerifierBackend, AztecClientBackend } from './backend.js';

export type BackendOptions = {
  /** @description Number of threads to run the backend worker on */
  threads?: number;

  /** @description Initial and Maximum memory to be alloted to the backend worker */
  memory?: { initial?: number; maximum?: number };

  /** @description Path to download CRS files */
  crsPath?: string;

  /** @description Path to download WASM files */
  wasmPath?: string;

  /** @description Custom path to bb binary for native backend (overrides automatic detection) */
  bbPath?: string;

  /** @description Logging function */
  logger?: (msg: string) => void;

  /**
   * @description Run WASM on a worker thread (default: auto-detect based on environment)
   * - true: Browser-safe, runs on worker thread (slower due to serialization overhead)
   * - false: Faster performance but blocks the calling thread (use for Node.js/benchmarks)
   * - undefined: Auto-detect (true in browser, false in Node.js)
   */
  useWorker?: boolean;

  /**
   * @description Force WASM backend even if native backend is available (default: false)
   * Useful for testing WASM implementation or when native backend has compatibility issues
   */
  forceWasm?: boolean;

  /**
   * @description Force native backend and error if not available (default: false)
   * Useful for ensuring native backend is used in production or when WASM is not acceptable
   */
  forceNative?: boolean;
};

export type CircuitOptions = {
  /** @description Whether to produce SNARK friendly proofs */
  recursive: boolean;
};

/**
 * The main class library consumers interact with.
 * It extends the generated api, and provides a static constructor "new" to compose components.
 */
export class Barretenberg extends AsyncApi {
  private options: BackendOptions;

  private constructor(backend: IMsgpackBackendAsync, options: BackendOptions) {
    super(backend);
    this.options = options;
  }

  /**
   * Constructs an instance of Barretenberg.
   * Tries to use native backend first (if available), otherwise launches WASM in a worker.
   * For WASM: it blocks waiting on child threads to complete, so blocking the main thread
   * in the browser is not allowed. If threads > 1 (defaults to hardware availability),
   * child threads will be created on their own workers.
   */
  static async new(options: BackendOptions = {}) {
    const logger = options.logger ?? createDebugLogger('bb_async');

    // Validate mutually exclusive options
    if (options.forceWasm && options.forceNative) {
      throw new Error('Cannot specify both forceWasm and forceNative options');
    }

    // Try native backend first (check custom path or auto-detect)
    // Skip if forceWasm is explicitly set
    if (!options.forceWasm) {
      const bbPath = findBbBinary(options.bbPath);
      if (bbPath) {
        logger(`Using native backend: ${bbPath}`);
        const native = new BarretenbergNativeSocketAsyncBackend(bbPath);
        return new Barretenberg(native, options);
      }

      // If forceNative is set and no binary found, error out
      if (options.forceNative) {
        throw new Error(
          'Native backend forced but bb binary not found. ' +
            'Set BB_BINARY_PATH environment variable or bbPath option, or remove forceNative option.',
        );
      }
    }

    // Fallback to WASM (or forced WASM)
    logger(options.forceWasm ? 'Forcing WASM backend' : 'Native backend not found, using WASM');

    // Default useWorker based on environment: true in browser, false in Node.js
    const useWorker = options.useWorker ?? (typeof window !== 'undefined');

    const wasm = await BarretenbergWasmAsyncBackend.new({
      threads: options.threads,
      wasmPath: options.wasmPath,
      logger,
      memory: options.memory,
      useWorker,
    });
    return new Barretenberg(wasm, options);
  }

  async initSRSForCircuitSize(circuitSize: number): Promise<void> {
    const minSRSSize = 2 ** 9; // 2**9 is the dyadic size for the SmallSubgroupIPA MSM.
    const crs = await Crs.new(Math.max(circuitSize, minSRSSize) + 1, this.options.crsPath, this.options.logger);
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1129): Do slab allocator initialization?
    // await this.commonInitSlabAllocator(circuitSize);
    await this.srsInitSrs({ pointsBuf: crs.getG1Data(), numPoints: crs.numPoints, g2Point: crs.getG2Data() });
  }

  async initSRSClientIVC(srsSize = this.getDefaultSrsSize()): Promise<void> {
    // crsPath can be undefined
    const crs = await Crs.new(srsSize + 1, this.options.crsPath, this.options.logger);
    const grumpkinCrs = await GrumpkinCrs.new(2 ** 16 + 1, this.options.crsPath, this.options.logger);

    // Load CRS into wasm global CRS state.
    // TODO: Make RawBuffer be default behavior, and have a specific Vector type for when wanting length prefixed.
    await this.srsInitSrs({ pointsBuf: crs.getG1Data(), numPoints: crs.numPoints, g2Point: crs.getG2Data() });
    await this.srsInitGrumpkinSrs({ pointsBuf: grumpkinCrs.getG1Data(), numPoints: grumpkinCrs.numPoints });
  }

  getDefaultSrsSize(): number {
    // iOS browser is very aggressive with memory. Check if running in browser and on iOS
    // We expect the mobile iOS browser to kill us >=1GB, so no real use in using a larger SRS.
    if (typeof window !== 'undefined' && /iPad|iPhone/.test(navigator.userAgent)) {
      return 2 ** 18;
    }
    return 2 ** 20;
  }

  async acirGetCircuitSizes(
    bytecode: Uint8Array,
    recursive: boolean,
    honkRecursion: boolean,
  ): Promise<[number, number]> {
    const response = await this.circuitStats({
      circuit: { name: '', bytecode, verificationKey: new Uint8Array() },
      includeGatesPerOpcode: false,
      settings: {
        ipaAccumulation: false,
        oracleHashType: honkRecursion ? 'poseidon2' : 'keccak',
        disableZk: !recursive,
        optimizedSolidityVerifier: false,
      },
    });
    return [response.numGates, response.numGatesDyadic];
  }

  async acirInitSRS(bytecode: Uint8Array, recursive: boolean, honkRecursion: boolean): Promise<void> {
    const [_, subgroupSize] = await this.acirGetCircuitSizes(bytecode, recursive, honkRecursion);
    return this.initSRSForCircuitSize(subgroupSize);
  }

  async destroy() {
    return super.destroy();
  }

  /**
   * Initialize the singleton instance of Barretenberg.
   * @param options Backend configuration options
   */
  static async initSingleton(options: BackendOptions = {}) {
    if (!barretenbergSingletonPromise) {
      barretenbergSingletonPromise = Barretenberg.new(options);
    }
    try {
      barretenbergSingleton = await barretenbergSingletonPromise;
      return barretenbergSingleton;
    } catch (error) {
      // If initialization fails, clear the singleton so next call can retry
      barretenbergSingleton = undefined!;
      barretenbergSingletonPromise = undefined!;
      throw error;
    }
  }

  static async destroySingleton() {
    if (barretenbergSingleton) {
      await barretenbergSingleton.destroy();
      barretenbergSingleton = undefined!;
      barretenbergSingletonPromise = undefined!;
    }
  }

  /**
   * Get the singleton instance of Barretenberg.
   * Must call initSingleton() first.
   */
  static getSingleton() {
    if (!barretenbergSingleton) {
      throw new Error('First call Barretenberg.initSingleton() on @aztec/bb.js module.');
    }
    return barretenbergSingleton;
  }
}

let barretenbergSingletonPromise: Promise<Barretenberg>;
let barretenbergSingleton: Barretenberg;

let barretenbergSyncSingletonPromise: Promise<BarretenbergSync>;
let barretenbergSyncSingleton: BarretenbergSync;

export class BarretenbergSync extends SyncApi {
  private constructor(backend: IMsgpackBackendSync) {
    super(backend);
  }

  /**
   * Create a new BarretenbergSync instance.
   * Tries to use native backend first (if available), otherwise uses WASM.
   * Uses pipe-based backend for sync operations (stdin/stdout) as it works better with blocking I/O.
   * @param options Backend configuration options
   */
  private static async new(options: BackendOptions = {}) {
    const logger = options.logger ?? createDebugLogger('bb_sync');

    // Validate mutually exclusive options
    if (options.forceWasm && options.forceNative) {
      throw new Error('Cannot specify both forceWasm and forceNative options');
    }

    // Try native backend first (using pipes for sync operations)
    // Skip if forceWasm is explicitly set
    if (!options.forceWasm) {
      const bbPath = findBbBinary(options.bbPath);
      if (bbPath) {
        logger(`Using native pipe backend: ${bbPath}`);
        const native = new BarretenbergNativeSyncBackend(bbPath);
        return new BarretenbergSync(native);
      }

      // If forceNative is set and no binary found, error out
      if (options.forceNative) {
        throw new Error(
          'Native backend forced but bb binary not found. ' +
            'Set BB_BINARY_PATH environment variable or bbPath option, or remove forceNative option.',
        );
      }
    }

    // Fallback to WASM (or forced WASM)
    logger(options.forceWasm ? 'Forcing WASM backend' : 'Native backend not found, using WASM');
    const wasm = await BarretenbergWasmSyncBackend.new(options.wasmPath, logger);
    return new BarretenbergSync(wasm);
  }

  /**
   * Initialize the singleton instance.
   * @param options Backend configuration options
   */
  static async initSingleton(options: BackendOptions = {}) {
    if (!barretenbergSyncSingletonPromise) {
      barretenbergSyncSingletonPromise = BarretenbergSync.new(options);
    }

    barretenbergSyncSingleton = await barretenbergSyncSingletonPromise;
    return barretenbergSyncSingleton;
  }

  static destroySingleton() {
    if (barretenbergSyncSingleton) {
      barretenbergSyncSingleton.destroy();
      barretenbergSyncSingleton = undefined!;
      barretenbergSyncSingletonPromise = undefined!;
    }
  }

  static getSingleton() {
    if (!barretenbergSyncSingleton) {
      throw new Error('First call BarretenbergSync.initSingleton() on @aztec/bb.js module.');
    }
    return barretenbergSyncSingleton;
  }
}
