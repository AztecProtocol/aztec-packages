import { Crs, GrumpkinCrs } from '../crs/index.js';
import { createDebugLogger } from '../log/index.js';
import { AsyncApi } from '../cbind/generated/async.js';
import { SyncApi } from '../cbind/generated/sync.js';
import { IMsgpackBackendSync, IMsgpackBackendAsync } from '../backend/interface.js';
import { BarretenbergNativeSocketAsyncBackend } from '../backend/native_socket.js';
import { BarretenbergWasmSyncBackend, BarretenbergWasmAsyncBackend } from '../backend/wasm.js';
import { BarretenbergNativeShmSyncBackend } from '../backend/native_shm.js';
import { SyncToAsyncAdapter } from '../backend/sync_to_async_adapter.js';
import { findBbBinary, findNapiBinary } from '../backend/platform.js';

export { UltraHonkBackend, UltraHonkVerifierBackend, AztecClientBackend } from './backend.js';

/**
 * Backend types for Barretenberg
 */
export enum BackendType {
  /** WASM direct execution (no worker) */
  Wasm = 'wasm',
  /** WASM with worker threads */
  WasmWorker = 'wasm-worker',
  /** Native via Unix domain socket (async only) */
  NativeUnixSocket = 'native-unix-socket',
  /** Native via shared memory (sync only currently) */
  NativeSharedMemory = 'native-shared-mem',
}

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
   * @description Maximum concurrent clients for shared memory IPC server (default: 1)
   * Only applies to NativeSharedMemory backend
   */
  maxClients?: number;

  /**
   * @description Specify exact backend to use
   * - If unset: tries backends in default order with fallback
   * - If set: must succeed with specified backend or throw error (no fallback)
   *
   * Barretenberg (async) supports: all types
   * BarretenbergSync supports: Wasm, NativeSharedMem only
   */
  backend?: BackendType;
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
      return await Barretenberg.createBackend(options.backend, options, logger);
    }

    if (typeof window === 'undefined') {
      const bbPath = findBbBinary(options.bbPath);
      if (!bbPath) {
        logger(`No native binary found, falling back to WASM`);
        return await Barretenberg.createBackend(BackendType.Wasm, options, logger);
      }
      logger(`bb binary found at: ${bbPath}`);

      try {
        const napiPath = findNapiBinary();
        if (!napiPath) {
          logger(`No NAPI stub found. Attempting native domain socket backend`);
          return await Barretenberg.createBackend(BackendType.NativeUnixSocket, { ...options, bbPath }, logger);
        } else {
          logger(`Attempting native shared memory backend`);
          return await Barretenberg.createBackend(BackendType.NativeSharedMemory, { ...options, bbPath }, logger);
        }
      } catch (err: any) {
        logger(`Native unavailable (${err.message}), falling back to WASM`);
        return await Barretenberg.createBackend(BackendType.Wasm, options, logger);
      }
    } else {
      logger(`In browser, using WASM over worker backend.`);
      return await Barretenberg.createBackend(BackendType.WasmWorker, options, logger);
    }
  }

  /**
   * Create backend of specific type (no fallback)
   */
  private static async createBackend(
    type: BackendType,
    options: BackendOptions,
    logger: (msg: string) => void,
  ): Promise<Barretenberg> {
    switch (type) {
      case BackendType.NativeUnixSocket: {
        const bbPath = findBbBinary(options.bbPath);
        if (!bbPath) {
          throw new Error('Native backend requires bb binary.');
        }
        logger(`Using native Unix socket backend: ${bbPath}`);
        const socket = new BarretenbergNativeSocketAsyncBackend(bbPath, options.threads);
        return new Barretenberg(socket, options);
      }

      case BackendType.NativeSharedMemory: {
        const bbPath = findBbBinary(options.bbPath);
        if (!bbPath) {
          throw new Error('Native backend requires bb binary.');
        }
        const napiPath = findNapiBinary();
        if (!napiPath) {
          throw new Error('Native sync backend requires napi client stub.');
        }
        logger(`Using native shared memory backend (via sync adapter): ${bbPath}`);
        // Use sync backend with adapter to provide async interface
        const syncBackend = await BarretenbergNativeShmSyncBackend.new(bbPath, options.threads, options.maxClients);
        const asyncBackend = new SyncToAsyncAdapter(syncBackend);
        return new Barretenberg(asyncBackend, options);
      }

      case BackendType.Wasm:
      case BackendType.WasmWorker: {
        const useWorker = type === BackendType.WasmWorker;
        logger(`Using WASM backend (worker: ${useWorker})`);
        const wasm = await BarretenbergWasmAsyncBackend.new({
          threads: options.threads,
          wasmPath: options.wasmPath,
          logger,
          memory: options.memory,
          useWorker,
        });
        return new Barretenberg(wasm, options);
      }

      default:
        throw new Error(`Unknown backend type: ${type}`);
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
  private constructor(backend: IMsgpackBackendSync) {
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
      return await BarretenbergSync.createBackend(options.backend, options, logger);
    }

    // Try native, fallback to WASM.
    try {
      return await BarretenbergSync.createBackend(BackendType.NativeSharedMemory, options, logger);
    } catch (err: any) {
      logger(`Shared memory unavailable (${err.message}), falling back to WASM`);
    }

    // Fallback to WASM
    logger('Using WASM backend');
    return await BarretenbergSync.createBackend(BackendType.Wasm, options, logger);
  }

  /**
   * Create backend of specific type (no fallback)
   */
  private static async createBackend(
    type: BackendType,
    options: BackendOptions,
    logger: (msg: string) => void,
  ): Promise<BarretenbergSync> {
    switch (type) {
      case BackendType.NativeSharedMemory: {
        const bbPath = findBbBinary(options.bbPath);
        if (!bbPath) {
          throw new Error('Native backend requires bb binary.');
        }
        const napiPath = findNapiBinary();
        if (!napiPath) {
          throw new Error('Native sync backend requires napi client stub.');
        }
        logger(`Using native shared memory backend: ${bbPath}`);
        const shm = await BarretenbergNativeShmSyncBackend.new(bbPath, options.threads, options.maxClients);
        return new BarretenbergSync(shm);
      }

      case BackendType.Wasm:
        logger('Using WASM backend');
        const wasm = await BarretenbergWasmSyncBackend.new(options.wasmPath, logger);
        return new BarretenbergSync(wasm);

      default:
        throw new Error(`Backend ${type} not supported for BarretenbergSync`);
    }
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
