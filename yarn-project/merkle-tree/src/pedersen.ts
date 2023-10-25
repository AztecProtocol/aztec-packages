import { pedersenGetHash, pedersenGetHashTree, pedersenHashWithHashIndex } from '@aztec/circuits.js/barretenberg';
import { IWasmModule } from '@aztec/foundation/wasm';
import { Hasher } from '@aztec/types';

/**
 * A helper class encapsulating Pedersen hash functionality.
 * @deprecated Don't call pedersen directly in production code. Instead, create suitably-named functions for specific
 * purposes.
 */
export class Pedersen implements Hasher {
  constructor(private wasm: IWasmModule) {}

  /*
   * @deprecated Don't call pedersen directly in production code. Instead, create suitably-named functions for specific
   * purposes.
   */
  public hash(lhs: Uint8Array, rhs: Uint8Array): Buffer {
    const inputs = [lhs, rhs].map(b => Buffer.from(b));
    return this.hashInputs(inputs);
  }

  /*
   * @deprecated Don't call pedersen directly in production code. Instead, create suitably-named functions for specific
   * purposes.
   */
  public hashInputs(inputs: Buffer[]): Buffer {
    return pedersenHashWithHashIndex(this.wasm, inputs, 0);
  }

  /*
   * @deprecated Don't call pedersen directly in production code. Instead, create suitably-named functions for specific
   * purposes.
   */
  public hashToField(data: Uint8Array): Buffer {
    return pedersenGetHash(this.wasm, Buffer.from(data));
  }

  /*
   * @deprecated Don't call pedersen directly in production code. Instead, create suitably-named functions for specific
   * purposes.
   */
  public hashToTree(leaves: Buffer[]): Promise<Buffer[]> {
    return Promise.resolve(pedersenGetHashTree(this.wasm, leaves));
  }
}
