import { loadProverCrs, loadVerifierCrs } from '@aztec/barretenberg.js/wasm';
import { AsyncWasmWrapper, WasmModule } from '@aztec/foundation/wasm';
import { decode, encode } from '@msgpack/msgpack';

import isNode from 'detect-node';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const NAME = '/aztec3-circuits';

/**
 * A low-level wrapper for an instance of Aztec3 Circuits WASM.
 */
export class CircuitsWasm extends AsyncWasmWrapper {
  codePath = isNode ? join(dirname(fileURLToPath(import.meta.url)), `../../resources/${NAME}.wasm`) : `${NAME}.wasm`;

  static instance: Promise<CircuitsWasm>;

  /**
   * Get a singleton instance of the module.
   * @returns The singleton.
   */
  public static get(): Promise<CircuitsWasm> {
    if (!this.instance) this.instance = new CircuitsWasm().init();
    return this.instance;
  }

  /**
   * Create and initialize a Circuits module.
   * @deprecated Use the get method to retrieve a singleton instance.
   * @param initial - Initial memory pages.
   * @returns The module.
   */
  public static async new(initial?: number) {
    const barretenberg = new CircuitsWasm();
    await barretenberg.init(initial);
    return barretenberg;
  }

  constructor(loggerName?: string) {
    super(loggerName);
  }

  protected getImportFns(wasm: WasmModule) {
    return {
      ...super.getImportFns(wasm),

      // eslint-disable-next-line camelcase
      env_load_verifier_crs: this.wrapAsyncImportFn(async () => {
        return await loadVerifierCrs(wasm);
      }),
      // eslint-disable-next-line camelcase
      env_load_prover_crs: this.wrapAsyncImportFn(async (numPoints: number) => {
        return await loadProverCrs(wasm, numPoints);
      }),
    };
  }

  public getSchema(cbind: string): any {
    const outputSizePtr = this.call('bbmalloc', 4);
    const outputMsgpackPtr = this.call('bbmalloc', 4);
    this.call(cbind + '__schema', outputMsgpackPtr, outputSizePtr);
    const jsonSchema = this.wasm.getMemoryAsString(this.readPtr32(outputMsgpackPtr));
    this.call('bbfree', outputSizePtr);
    this.call('bbfree', outputMsgpackPtr);
    return JSON.parse(jsonSchema);
  }
  // Standard call format
  public async callCbind(cbind: string, input: any[]): Promise<any> {
    const outputSizePtr = this.call('bbmalloc', 4);
    const outputMsgpackPtr = this.call('bbmalloc', 4);
    console.log({ input });
    const inputBuffer = encode(input);
    console.log({ inputBuffer });
    const inputPtr = this.call('bbmalloc', inputBuffer.length);
    this.wasm.writeMemory(inputPtr, inputBuffer);
    await this.asyncCall(cbind, inputPtr, inputBuffer.length, outputMsgpackPtr, outputSizePtr);
    const encodedResult = this.wasm.getMemorySlice(
      this.readPtr32(outputMsgpackPtr),
      this.readPtr32(outputMsgpackPtr) + this.readPtr32(outputSizePtr),
    );
    const result = decode(encodedResult);
    this.call('bbfree', inputPtr);
    this.call('bbfree', outputSizePtr);
    this.call('bbfree', outputMsgpackPtr);
    return result;
  }
  // Written in little-endian as WASM native
  private readPtr32(ptr32: number) {
    const dataView = new DataView(this.getMemorySlice(ptr32, ptr32 + 4).buffer);
    return dataView.getUint32(0, /*little endian*/ true);
  }
}
