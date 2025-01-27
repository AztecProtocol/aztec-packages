import { BarretenbergApiSync } from '../barretenberg_api/index.js';
import { BarretenbergWasmMain } from '../barretenberg_wasm/barretenberg_wasm_main/index.js';
import { fetchModuleAndThreads } from '../barretenberg_wasm/index.js';

let barretenbergSyncSingleton: BarretenbergSync;
let barretenbergSyncSingletonPromise: Promise<BarretenbergSync>;

export class BarretenbergSync extends BarretenbergApiSync {
  private constructor(wasm: BarretenbergWasmMain) {
    super(wasm);
  }

  static async new() {
    const wasm = new BarretenbergWasmMain();
    const { module, threads } = await fetchModuleAndThreads(1);
    await wasm.init(module, threads);
    return new BarretenbergSync(wasm);
  }

  static initSingleton() {
    if (!barretenbergSyncSingletonPromise) {
      barretenbergSyncSingletonPromise = BarretenbergSync.new().then(s => (barretenbergSyncSingleton = s));
    }
    return barretenbergSyncSingletonPromise;
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

// If we're in ESM environment, use top level await. CJS users need to call it manually.
// Need to ignore for cjs build.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
await BarretenbergSync.initSingleton(); // POSTPROCESS ESM ONLY
