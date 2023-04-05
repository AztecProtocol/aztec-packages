import { WasmWrapper } from '@aztec/foundation/wasm';

/**
 * A low-level wrapper for an instance of the barretenberg primitives wasm.
 */
export class PrimitivesWasm extends WasmWrapper {
  // TODO: Load primitives.wasm instead of bb.wasm
  codeRelativePath: string = '/barretenberg.wasm';

  static instance: Promise<PrimitivesWasm>;

  /**
   * Get a singleton instance of the module.
   * @returns The singleton.
   */
  public static async get() {
    if (!this.instance) this.instance = new PrimitivesWasm().init();
    return this.instance;
  }

  private constructor(loggerName?: string) {
    super(loggerName);
  }
}
