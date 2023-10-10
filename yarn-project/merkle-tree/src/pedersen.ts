import {
  pedersenCompress,
  pedersenGetHash,
  pedersenGetHashTree,
  pedersenHashInputs,
} from '@aztec/circuits.js/barretenberg';
import { IWasmModule } from '@aztec/foundation/wasm';
import { Hasher } from '@aztec/types';

/**
 * A helper class encapsulating Pedersen hash functionality.
 * @deprecated Don't call pedersen directly in production code. Instead, create specific nicely-called WASM functions.
 */
export class Pedersen implements Hasher {
  constructor(private wasm: IWasmModule) {}

  /*
   * @deprecated Don't call pedersen directly in production code. Instead, create specific nicely-called WASM functions.
   */
  public compress(lhs: Uint8Array, rhs: Uint8Array): Buffer {
    return pedersenCompress(this.wasm, lhs, rhs);
  }

  /*
   * @deprecated Don't call pedersen directly in production code. Instead, create specific nicely-called WASM functions.
   */
  public compressInputs(inputs: Buffer[]): Buffer {
    return pedersenHashInputs(this.wasm, inputs);
  }

  /*
   * @deprecated Don't call pedersen directly in production code. Instead, create specific nicely-called WASM functions.
   */
  public hashToField(data: Uint8Array): Buffer {
    return pedersenGetHash(this.wasm, Buffer.from(data));
  }

  /*
   * @deprecated Don't call pedersen directly in production code. Instead, create specific nicely-called WASM functions.
   */
  public hashToTree(leaves: Buffer[]): Promise<Buffer[]> {
    return Promise.resolve(pedersenGetHashTree(this.wasm, leaves));
  }
}
