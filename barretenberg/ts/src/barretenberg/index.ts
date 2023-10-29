import { proxy } from 'comlink';
import { BarretenbergApi } from '../barretenberg_api/index.js';
import { BarretenbergBinder } from '../barretenberg_binder/index.js';
import { createMainWorker } from '../barretenberg_wasm/barretenberg_wasm_main/factory/node/index.js';
import { BarretenbergWasmMain, BarretenbergWasmMainWorker } from '../barretenberg_wasm/barretenberg_wasm_main/index.js';
import { getRemoteBarretenbergWasm } from '../barretenberg_wasm/helpers/index.js';
import { BarretenbergWasmWorker } from '../barretenberg_wasm/index.js';
import createDebug from 'debug';

const debug = createDebug('bb.js:wasm');

/**
 * The main class library consumers interact with.
 * It extends the generated api, and provides a static constructor "new" to compose components.
 */
export class Barretenberg extends BarretenbergApi {
  private constructor(private worker: any, private wasm: BarretenbergWasmWorker | BarretenbergWasmMain) {
    super(new BarretenbergBinder(wasm));
  }

  /**
   * Constructs an instance of Barretenberg.
   * Launches it within a worker. This is necessary as it block waiting on child threads to complete,
   * and blocking the main thread in the browser is not allowed.
   * It threads > 1 (defaults to hardware availability), child threads will be created on their own workers.
   */
  static async new(threads?: number) {
    const worker = createMainWorker();
    const wasm = getRemoteBarretenbergWasm<BarretenbergWasmMainWorker>(worker);
    await wasm.init(threads, proxy(debug));
    return new Barretenberg(worker, wasm);
  }

  static async newSync() {
    const wasm = new BarretenbergWasmMain();
    await wasm.init(1);
    return new Barretenberg(undefined, wasm);
  }

  async getNumThreads() {
    return await this.wasm.getNumThreads();
  }

  async destroy() {
    await this.wasm?.destroy();
    await this.worker?.terminate();
  }
}
