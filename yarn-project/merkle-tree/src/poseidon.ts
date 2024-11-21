import { poseidon2Hash } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { type Hasher } from '@aztec/types/interfaces';

/**
 * A helper class encapsulating poseidon2 hash functionality.
 * @deprecated Don't call poseidon2 directly in production code. Instead, create suitably-named functions for specific
 * purposes.
 */
export class Poseidon implements Hasher {
  /*
   * @deprecated Don't call poseidon2 directly in production code. Instead, create suitably-named functions for specific
   * purposes.
   */
  public async hash(lhs: Uint8Array, rhs: Uint8Array): Promise<Buffer> {
    return (await poseidon2Hash([Fr.fromBuffer(Buffer.from(lhs)), Fr.fromBuffer(Buffer.from(rhs))])).toBuffer();
  }

  /*
   * @deprecated Don't call poseidon2 directly in production code. Instead, create suitably-named functions for specific
   * purposes.
   */
  public async hashInputs(inputs: Buffer[]): Promise<Buffer> {
    const inputFields = inputs.map(i => Fr.fromBuffer(i));
    return (await poseidon2Hash(inputFields)).toBuffer();
  }
}
