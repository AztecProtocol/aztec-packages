import { Crs, GrumpkinCrs } from '../crs/index.js';
import { createDebugLogger } from '../log/index.js';
import { AsyncApi } from '../cbind/generated/async.js';
import { SyncApi } from '../cbind/generated/sync.js';
import { IMsgpackBackendSync, IMsgpackBackendAsync } from '../backend/interface.js';
import { BarretenbergNativeSyncBackend, BarretenbergNativeAsyncBackend } from '../backend/native.js';
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

    // Try native backend first (check custom path or auto-detect)
    const bbPath = findBbBinary(options.bbPath);
    if (bbPath) {
      logger(`Using native backend: ${bbPath}`);
      const native = new BarretenbergNativeAsyncBackend(bbPath);
      return new Barretenberg(native, options);
    }

    // Fallback to WASM
    logger('Native backend not found, using WASM');
    const wasm = await BarretenbergWasmAsyncBackend.new({
      threads: options.threads,
      wasmPath: options.wasmPath,
      logger,
      memory: options.memory,
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
}

let barretenbergSyncSingletonPromise: Promise<BarretenbergSync>;
let barretenbergSyncSingleton: BarretenbergSync;

export class BarretenbergSync extends SyncApi {
  private constructor(backend: IMsgpackBackendSync) {
    super(backend);
  }

  /**
   * Create a new BarretenbergSync instance.
   * Tries to use native backend first (if available), otherwise uses WASM.
   * @param options Backend configuration options
   */
  private static async new(options: BackendOptions = {}) {
    const logger = options.logger ?? createDebugLogger('bb_sync');

    // Try native backend first
    const bbPath = findBbBinary(options.bbPath);
    if (bbPath) {
      logger(`Using native backend: ${bbPath}`);
      const native = new BarretenbergNativeSyncBackend(bbPath);
      return new BarretenbergSync(native);
    }

    // Fallback to WASM
    logger('Native backend not found, using WASM');
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

  static getSingleton() {
    if (!barretenbergSyncSingleton) {
      throw new Error('First call BarretenbergSync.initSingleton() on @aztec/bb.js module.');
    }
    return barretenbergSyncSingleton;
  }
}
