import { proxy } from 'comlink';
import { BarretenbergApi, BarretenbergApiSync } from '../barretenberg_api/index.js';
import { createMainWorker } from '../barretenberg_wasm/barretenberg_wasm_main/factory/node/index.js';
import { BarretenbergWasmMain, BarretenbergWasmMainWorker } from '../barretenberg_wasm/barretenberg_wasm_main/index.js';
import { getRemoteBarretenbergWasm } from '../barretenberg_wasm/helpers/index.js';
import { BarretenbergWasmWorker, fetchModuleAndThreads } from '../barretenberg_wasm/index.js';
import createDebug from 'debug';
import { Crs, GrumpkinCrs } from '../crs/index.js';
import { RawBuffer } from '../types/raw_buffer.js';

export { BarretenbergVerifier } from './verifier.js';
export { UltraPlonkBackend, UltraHonkBackend, AztecClientBackend } from './backend.js';

const debug = createDebug('bb.js:wasm');

export type BackendOptions = {
  /** @description Number of threads to run the backend worker on */
  threads?: number;

  /** @description Initial and Maximum memory to be alloted to the backend worker */
  memory?: { initial?: number; maximum?: number };

  /** @description Path to download CRS files */
  crsPath?: string;

  /** @description Path to download WASM files */
  wasmPath?: string;
};

export type CircuitOptions = {
  /** @description Whether to produce SNARK friendly proofs */
  recursive: boolean;
};

/**
 * The main class library consumers interact with.
 * It extends the generated api, and provides a static constructor "new" to compose components.
 */
export class Barretenberg extends BarretenbergApi {
  private options: BackendOptions;

  private constructor(private worker: any, wasm: BarretenbergWasmWorker, options: BackendOptions) {
    super(wasm);
    this.options = options;
  }

  /**
   * Constructs an instance of Barretenberg.
   * Launches it within a worker. This is necessary as it blocks waiting on child threads to complete,
   * and blocking the main thread in the browser is not allowed.
   * It threads > 1 (defaults to hardware availability), child threads will be created on their own workers.
   */
  static async new(options: BackendOptions = {}) {
    const worker = createMainWorker();
    const wasm = getRemoteBarretenbergWasm<BarretenbergWasmMainWorker>(worker);
    const { module, threads } = await fetchModuleAndThreads(options.threads, options.wasmPath);
    await wasm.init(module, threads, proxy(debug), options.memory?.initial, options.memory?.maximum);
    return new Barretenberg(worker, wasm, options);
  }

  async getNumThreads() {
    return await this.wasm.getNumThreads();
  }

  async initSRSForCircuitSize(circuitSize: number): Promise<void> {
    const crs = await Crs.new(circuitSize + 1, this.options.crsPath);
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1129): Do slab allocator initialization?
    // await this.commonInitSlabAllocator(circuitSize);
    await this.srsInitSrs(new RawBuffer(crs.getG1Data()), crs.numPoints, new RawBuffer(crs.getG2Data()));
  }

  async initSRSClientIVC(): Promise<void> {
    // crsPath can be undefined
    const crs = await Crs.new(2 ** 20 + 1, this.options.crsPath);
    const grumpkinCrs = await GrumpkinCrs.new(2 ** 16 + 1, this.options.crsPath);

    // Load CRS into wasm global CRS state.
    // TODO: Make RawBuffer be default behavior, and have a specific Vector type for when wanting length prefixed.
    await this.srsInitSrs(new RawBuffer(crs.getG1Data()), crs.numPoints, new RawBuffer(crs.getG2Data()));
    await this.srsInitGrumpkinSrs(new RawBuffer(grumpkinCrs.getG1Data()), grumpkinCrs.numPoints);
  }

  async acirInitSRS(bytecode: Uint8Array, recursive: boolean, honkRecursion: boolean): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [_total, subgroupSize] = await this.acirGetCircuitSizes(bytecode, recursive, honkRecursion);
    return this.initSRSForCircuitSize(subgroupSize);
  }

  async destroy() {
    await this.wasm.destroy();
    await this.worker.terminate();
  }
}

let barrentenbergSyncSingletonPromise: Promise<BarretenbergSync>;
let barretenbergSyncSingleton: BarretenbergSync;

export class BarretenbergSync extends BarretenbergApiSync {
  private constructor(wasm: BarretenbergWasmMain) {
    super(wasm);
  }

  private static async new(wasmPath?: string) {
    const wasm = new BarretenbergWasmMain();
    const { module, threads } = await fetchModuleAndThreads(1, wasmPath);
    await wasm.init(module, threads);
    return new BarretenbergSync(wasm);
  }

  static async initSingleton(wasmPath?: string) {
    if (!barrentenbergSyncSingletonPromise) {
      barrentenbergSyncSingletonPromise = BarretenbergSync.new(wasmPath);
    }

    barretenbergSyncSingleton = await barrentenbergSyncSingletonPromise;
    return barretenbergSyncSingleton;
  }

  static getSingleton() {
    if (!barretenbergSyncSingleton) {
      throw new Error('First call BarretenbergSync.initSingleton() on @aztec/bb.js module.');
    }
    return barretenbergSyncSingleton;
  }

  getWasm() {
    return this.wasm;
  }
}
