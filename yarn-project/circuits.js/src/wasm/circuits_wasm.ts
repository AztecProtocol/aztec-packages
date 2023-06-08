import { IWasmModule, WasmModule } from '@aztec/foundation/wasm';

import isNode from 'detect-node';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const NAME = '/aztec3-circuits';
const CODE_PATH = isNode
  ? join(dirname(fileURLToPath(import.meta.url)), `../../resources/${NAME}.wasm`)
  : `${NAME}.wasm`;

/**
 * A low-level wrapper for an instance of Aztec3 Circuits WASM.
 */
export class CircuitsWasm implements IWasmModule {
  private wasm: WasmModule;
  static instance: Promise<CircuitsWasm>;

  constructor(loggerName?: string) {
    const wasm = new WasmModule(
      CODE_PATH,
      module => ({
        /**
         * Log a string from wasm.
         * @param addr - The string address to log.
         */
        logstr(addr: number) {
          const str = wasm.getMemoryAsString(addr);
          const m = wasm.getMemory();
          const str2 = `${str} (mem: ${(m.length / (1024 * 1024)).toFixed(2)}MB)`;
          wasm.getLogger()(str2);
        },
        memory: module.getRawMemory(),
        // eslint-disable-next-line camelcase
        set_data: () => {
          throw new Error(
            'NOT YET IMPLEMENTED - needed for proofs, plan is to use barretenberg.js from NPM for proofs. See https://github.com/AztecProtocol/aztec-packages/issues/781',
          );
        },
        // eslint-disable-next-line camelcase
        get_data: () => {
          throw new Error(
            'NOT YET IMPLEMENTED - needed for proofs, plan is to use barretenberg.js from NPM for proofs. See https://github.com/AztecProtocol/aztec-packages/issues/781',
          );
        },
      }),
      loggerName,
    );
    this.wasm = wasm;
  }

  /**
   * Get a singleton instance of the module.
   * @returns The singleton.
   */
  public static get(): Promise<CircuitsWasm> {
    if (!this.instance) this.instance = new CircuitsWasm().init();
    return this.instance;
  }

  /**
   * 30 pages by default. 30*2**16 \> 1mb stack size plus other overheads.
   * 8192 maximum by default. 512mb.
   * @param initial - Initial memory pages.
   * @param maximum - Max memory pages.
   * @returns The wrapper.
   */
  public async init(initial = 30, maximum = 8192): Promise<this> {
    await this.wasm.init(initial, maximum);
    return this;
  }

  /**
   * Create and initialize a Circuits module.
   * @deprecated Use the get method to retrieve a singleton instance.
   * @param initial - Initial memory pages.
   * @returns The module.
   */
  public static async new(initial?: number) {
    const circuitsWasm = new CircuitsWasm();
    await circuitsWasm.init(initial);
    return circuitsWasm;
  }

  /**
   * Retrieve the exports object of the CircuitsWasm module.
   *
   * @returns An object containing exported functions and properties.
   */
  public exports(): any {
    return this.wasm.exports();
  }

  /**
   * Get a slice of memory between two addresses.
   * @param start - The start address.
   * @param end - The end address.
   * @returns A Uint8Array view of memory.
   */
  public getMemorySlice(start: number, end: number) {
    return this.wasm.getMemorySlice(start, end);
  }

  /**
   * Write data into the heap.
   * @param arr - The data to write.
   * @param offset - The address to write data at.
   */
  public writeMemory(offset: number, arr: Uint8Array) {
    this.wasm.writeMemory(offset, arr);
  }

  /**
   * Get memory as string.
   * @param offset - The address to get null-terminated string data from.
   * @returns JS string.
   */
  public getMemoryAsString(offset: number) {
    return this.wasm.getMemoryAsString(offset);
  }

  /**
   * Calls into the WebAssembly.
   * @param name - The method name.
   * @param args - The arguments to the method.
   * @returns The numeric integer or address result.
   */
  public call(name: string, ...args: any): number {
    return this.wasm.call(name, ...args);
  }
}
