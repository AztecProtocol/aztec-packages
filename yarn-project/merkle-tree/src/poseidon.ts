import { poseidon2Hash, poseidon2HashWithSeparator } from '@aztec/foundation/crypto/sync';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { Hasher } from '@aztec/foundation/trees';

/**
 * A helper class encapsulating poseidon2 hash functionality.
 * @deprecated Don't call poseidon2 directly in production code. Instead, create suitably-named functions for specific
 * purposes.
 */
export class Poseidon implements Hasher {
  constructor(private merkleSeparator: number) {}

  /*
   * @deprecated Don't call poseidon2 directly in production code. Instead, create suitably-named functions for specific
   * purposes.
   */
  public hash(lhs: Uint8Array, rhs: Uint8Array) {
    return poseidon2HashWithSeparator(
      [Fr.fromBuffer(Buffer.from(lhs)), Fr.fromBuffer(Buffer.from(rhs))],
      this.merkleSeparator,
    ).toBuffer() as Buffer<ArrayBuffer>;
  }

  /*
   * @deprecated Don't call poseidon2 directly in production code. Instead, create suitably-named functions for specific
   * purposes.
   */
  public hashInputs(inputs: Buffer[]) {
    const inputFields = inputs.map(i => Fr.fromBuffer(i));
    return poseidon2Hash(inputFields).toBuffer() as Buffer<ArrayBuffer>;
  }
}
