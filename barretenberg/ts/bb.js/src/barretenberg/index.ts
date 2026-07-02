import { Crs, GrumpkinCrs } from '../crs/index.js';
import { AsyncApi } from '../cbind/generated/async.js';
import { SyncApi } from '../cbind/generated/sync.js';
import { IMsgpackBackendSync, IMsgpackBackendAsync } from '../bb_backends/interface.js';
import { BackendOptions, BackendType } from '../bb_backends/index.js';
import { createAsyncBackend, createSyncBackend } from '../bb_backends/node/index.js';

const DEFAULT_BB_CRS_SIZE = 2 ** 19;
// Keep the iOS default separate so it can diverge when mobile memory limits require it.
const IOS_BB_CRS_SIZE = 2 ** 18;

export {
  UltraHonkBackend,
  UltraHonkVerifierBackend,
  AztecClientBackend,
  flattenChonkProofFields,
  fieldToString,
  fieldsToStrings,
  type AztecClientProveResult,
  type UltraHonkBackendOptions,
  type VerifierTarget,
} from './backend.js';
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
   *   1. NativeUnixSocket (if bb binary available)
   *   2. WasmWorker (in browser) or Wasm (in Node.js)
   */
  static async new(options: BackendOptions = {}) {
    const logger = options.logger ?? (() => {});

    if (options.backend) {
      // Explicit backend required - no fallback
      const backend = await createAsyncBackend(options.backend, options, logger);
      if (!options.skipSrsInit && (options.backend === BackendType.Wasm || options.backend === BackendType.WasmWorker)) {
        await backend.initSRSChonk(options.srsSize);
      }
      return backend;
    }

    if (typeof window === 'undefined') {
      try {
        return await createAsyncBackend(BackendType.NativeUnixSocket, options, logger);
      } catch (err: any) {
        logger(`Unix socket unavailable (${err.message}), falling back to WASM`);
        const backend = await createAsyncBackend(BackendType.Wasm, options, logger);
        if (!options.skipSrsInit) {
          await backend.initSRSChonk(options.srsSize);
        }
        return backend;
      }
    } else {
      logger(`In browser, using WASM over worker backend.`);
      const backend = await createAsyncBackend(BackendType.WasmWorker, options, logger);
      if (!options.skipSrsInit) {
        await backend.initSRSChonk(options.srsSize);
      }
      return backend;
    }
  }

  async initSRSChonk(srsSize = this.getDefaultSrsSize()): Promise<void> {
    // crsPath can be undefined
    const crs = await Crs.new(srsSize, this.options.crsPath, this.options.logger);
    const grumpkinCrs = await GrumpkinCrs.new(2 ** 16, this.options.crsPath, this.options.logger);

    // Load CRS into wasm global CRS state.
    // srsInitSrs auto-detects compressed (32B/point) vs uncompressed (64B/point).
    // When decompressing, it returns the uncompressed bytes so we can cache them.
    const response = await this.srsInitSrs({
      pointsBuf: crs.getG1Data(),
      numPoints: crs.numPoints,
      g2Point: crs.getG2Data(),
    });
    if (response.pointsBuf.length > 0) {
      await crs.cacheUncompressed(response.pointsBuf);
    }
    await this.srsInitGrumpkinSrs({ pointsBuf: grumpkinCrs.getG1Data(), numPoints: grumpkinCrs.numPoints });
  }

  getDefaultSrsSize(): number {
    // iOS browser is very aggressive with memory. Check if running in browser and on iOS.
    // We expect the mobile iOS browser to kill us >=1GB, so no real use in using a larger SRS.
    // Use `self` instead of `window` so this check also works inside Web Workers.
    if (typeof self !== 'undefined' && typeof self.navigator !== 'undefined' && /iPad|iPhone/.test(self.navigator.userAgent)) {
      return IOS_BB_CRS_SIZE;
    }
    return DEFAULT_BB_CRS_SIZE;
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

  async destroy() {
    return super.destroy();
  }

  /**
   * Initialize the singleton instance of Barretenberg.
   * @param options Backend configuration options
   */
  static async initSingleton(options: BackendOptions = {}) {
    if (!barretenbergSingletonPromise) {
      barretenbergSingletonPromise = Barretenberg.new({ ...options, unref: true });
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
    const logger = options.logger ?? (() => {});

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
