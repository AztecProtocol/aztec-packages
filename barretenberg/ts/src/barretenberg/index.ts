import { proxy } from 'comlink';
import { BarretenbergApi, BarretenbergApiSync } from '../barretenberg_api/index.js';
import { createMainWorker } from '../barretenberg_wasm/barretenberg_wasm_main/factory/node/index.js';
import { BarretenbergWasmMain, BarretenbergWasmMainWorker } from '../barretenberg_wasm/barretenberg_wasm_main/index.js';
import { getRemoteBarretenbergWasm } from '../barretenberg_wasm/helpers/index.js';
import { Crs, GrumpkinCrs } from '../crs/index.js';
import { RawBuffer } from '../types/raw_buffer.js';
import { fetchModuleAndThreads } from '../barretenberg_wasm/index.js';
import { createDebugLogger } from '../log/index.js';
import { AsyncApi } from '../cbind/generated/async.js';
import { BbApiBase, CircuitComputeVk, CircuitProve, CircuitVerify, ClientIvcAccumulate, ClientIvcComputeIvcVk, ClientIvcGates, ClientIvcLoad, ClientIvcProve, ClientIvcStart, ClientIvcVerify, VkAsFields } from '../cbind/generated/api_types.js';

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
export class Barretenberg extends BarretenbergApi {
  private options: BackendOptions;
  private bbApi: BbApiBase;

  private constructor(
    private worker: any,
    wasm: BarretenbergWasmMainWorker,
    options: BackendOptions,
  ) {
    super(wasm);
    this.options = options;
    this.bbApi = new AsyncApi(wasm);
  }

  /**
   * Constructs an instance of Barretenberg.
   * Launches it within a worker. This is necessary as it blocks waiting on child threads to complete,
   * and blocking the main thread in the browser is not allowed.
   * It threads > 1 (defaults to hardware availability), child threads will be created on their own workers.
   */
  static async new(options: BackendOptions = {}) {
    const worker = await createMainWorker();
    const wasm = getRemoteBarretenbergWasm<BarretenbergWasmMainWorker>(worker);
    const { module, threads } = await fetchModuleAndThreads(options.threads, options.wasmPath, options.logger);
    await wasm.init(
      module,
      threads,
      proxy(options.logger ?? createDebugLogger('bb_wasm_async')),
      options.memory?.initial,
      options.memory?.maximum,
    );
    return new Barretenberg(worker, wasm, options);
  }

  async getNumThreads() {
    return await this.wasm.getNumThreads();
  }

  async initSRSForCircuitSize(circuitSize: number): Promise<void> {
    const crs = await Crs.new(circuitSize + 1, this.options.crsPath, this.options.logger);
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1129): Do slab allocator initialization?
    // await this.commonInitSlabAllocator(circuitSize);
    await this.srsInitSrs(new RawBuffer(crs.getG1Data()), crs.numPoints, new RawBuffer(crs.getG2Data()));
  }

  async initSRSClientIVC(srsSize = this.getDefaultSrsSize()): Promise<void> {
    // crsPath can be undefined
    const crs = await Crs.new(srsSize + 1, this.options.crsPath, this.options.logger);
    const grumpkinCrs = await GrumpkinCrs.new(2 ** 16 + 1, this.options.crsPath, this.options.logger);

    // Load CRS into wasm global CRS state.
    // TODO: Make RawBuffer be default behavior, and have a specific Vector type for when wanting length prefixed.
    await this.srsInitSrs(new RawBuffer(crs.getG1Data()), crs.numPoints, new RawBuffer(crs.getG2Data()));
    await this.srsInitGrumpkinSrs(new RawBuffer(grumpkinCrs.getG1Data()), grumpkinCrs.numPoints);
  }

  getDefaultSrsSize(): number {
    // iOS browser is very aggressive with memory. Check if running in browser and on iOS
    // We expect the mobile iOS browser to kill us >=1GB, so no real use in using a larger SRS.
    if (typeof window !== 'undefined' && /iPad|iPhone/.test(navigator.userAgent)) {
      return 2 ** 18;
    }
    return 2 ** 20;
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

  getWasm() {
    return this.wasm;
  }

  // Wrap ClientIVC methods used by AztecClientBackend and UltraHonkBackend
  async clientIvcStart(command: ClientIvcStart) {
    return this.bbApi.clientIvcStart(command);
  }

  async clientIvcLoad(command: ClientIvcLoad) {
    return this.bbApi.clientIvcLoad(command);
  }

  async clientIvcAccumulate(command: ClientIvcAccumulate) {
    return this.bbApi.clientIvcAccumulate(command);
  }

  async clientIvcProve(command: ClientIvcProve) {
    return this.bbApi.clientIvcProve(command);
  }

  async clientIvcVerify(command: ClientIvcVerify) {
    return this.bbApi.clientIvcVerify(command);
  }

  async clientIvcComputeIvcVk(command: ClientIvcComputeIvcVk) {
    return this.bbApi.clientIvcComputeIvcVk(command);
  }

  async clientIvcGates(command: ClientIvcGates) {
    return this.bbApi.clientIvcGates(command);
  }

  // Wrap circuit methods used by BbApiUltraHonkBackend
  async circuitProve(command: CircuitProve) {
    return this.bbApi.circuitProve(command);
  }

  async circuitComputeVk(command: CircuitComputeVk) {
    return this.bbApi.circuitComputeVk(command);
  }

  async circuitVerify(command: CircuitVerify) {
    return this.bbApi.circuitVerify(command);
  }

  async vkAsFields(command: VkAsFields) {
    return this.bbApi.vkAsFields(command);
  }
}

let barretenbergSyncSingletonPromise: Promise<BarretenbergSync>;
let barretenbergSyncSingleton: BarretenbergSync;

export class BarretenbergSync extends BarretenbergApiSync {
  private constructor(wasm: BarretenbergWasmMain) {
    super(wasm);
  }

  private static async new(wasmPath?: string, logger: (msg: string) => void = createDebugLogger('bb_wasm_sync')) {
    const wasm = new BarretenbergWasmMain();
    const { module, threads } = await fetchModuleAndThreads(1, wasmPath, logger);
    await wasm.init(module, threads, logger);
    return new BarretenbergSync(wasm);
  }

  static async initSingleton(wasmPath?: string, logger: (msg: string) => void = createDebugLogger('bb_wasm_sync')) {
    if (!barretenbergSyncSingletonPromise) {
      barretenbergSyncSingletonPromise = BarretenbergSync.new(wasmPath, logger);
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

  getWasm() {
    return this.wasm;
  }
}
