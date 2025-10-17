import { Crs, GrumpkinCrs } from '../crs/index.js';
import { createDebugLogger } from '../log/index.js';
import { AsyncApi } from '../cbind/generated/async.js';
import { SyncApi } from '../cbind/generated/sync.js';
import { IMsgpackBackendSync, IMsgpackBackendAsync } from '../bb_backends/interface.js';
import { BackendOptions, BackendType } from '../bb_backends/index.js';
import { createAsyncBackend, createSyncBackend } from '../bb_backends/node/index.js';

export { UltraHonkBackend, UltraHonkVerifierBackend, AztecClientBackend } from './backend.js';
export * from '../bb_backends/index.js';

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

  constructor(backend: IMsgpackBackendAsync, options: BackendOptions) {
    super(backend);
    this.options = options;
  }

  /**
   * Constructs an instance of Barretenberg.
   *
   * If options.backend is set: uses that specific backend (throws if unavailable)
   * If options.backend is unset: tries backends in order with fallback:
   *   1. NativeSharedMemory (if bb binary available)
   *   2. WasmWorker (in browser) or Wasm (in Node.js)
   */
  static async new(options: BackendOptions = {}) {
    const logger = options.logger ?? createDebugLogger('bb_async');

    if (options.backend) {
      // Explicit backend required - no fallback
      return await createAsyncBackend(options.backend, options, logger);
    }

    if (typeof window === 'undefined') {
      try {
        return await createAsyncBackend(BackendType.NativeSharedMemory, options, logger);
      } catch (err: any) {
        logger(`Shared memory unavailable (${err.message}), falling back to other backends`);
        try {
          return await createAsyncBackend(BackendType.NativeUnixSocket, options, logger);
        } catch (err: any) {
          logger(`Unix socket unavailable (${err.message}), falling back to WASM`);
          return await createAsyncBackend(BackendType.Wasm, options, logger);
        }
      }
    } else {
      logger(`In browser, using WASM over worker backend.`);
      return await createAsyncBackend(BackendType.WasmWorker, options, logger);
    }
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
  constructor(backend: IMsgpackBackendSync) {
    super(backend);
  }

  /**
   * Create a new BarretenbergSync instance.
   *
   * If options.backend is set: uses that specific backend (throws if unavailable)
   * If options.backend is unset: tries backends in order with fallback:
   *   1. NativeSharedMem (if bb binary + NAPI module available)
   *   2. Wasm
   *
   * Supported backends: Wasm, NativeSharedMem
   * Not supported: WasmWorker (no workers in sync), NativeUnixSocket (async only)
   */
  static async new(options: BackendOptions = {}) {
    const logger = options.logger ?? createDebugLogger('bb_sync');

    if (options.backend) {
      return await createSyncBackend(options.backend, options, logger);
    }

    // Try native, fallback to WASM.
    try {
      return await createSyncBackend(BackendType.NativeSharedMemory, options, logger);
    } catch (err: any) {
      logger(`Shared memory unavailable (${err.message}), falling back to WASM`);
    }

    return await createSyncBackend(BackendType.Wasm, options, logger);
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
