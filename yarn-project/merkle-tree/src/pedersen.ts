import { pedersenHash } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { type Hasher } from '@aztec/types/interfaces';

/**
 * A helper class encapsulating Pedersen hash functionality.
 * @deprecated Don't call pedersen directly in production code. Instead, create suitably-named functions for specific
 * purposes.
 */
export class Pedersen implements Hasher {
  /*
   * @deprecated Don't call pedersen directly in production code. Instead, create suitably-named functions for specific
   * purposes.
   */
  public async hash(lhs: Uint8Array, rhs: Uint8Array): Promise<Buffer> {
    return (await pedersenHash([Fr.fromBuffer(Buffer.from(lhs)), Fr.fromBuffer(Buffer.from(rhs))])).toBuffer();
  }

  /*
   * @deprecated Don't call pedersen directly in production code. Instead, create suitably-named functions for specific
   * purposes.
   */
  public async hashInputs(inputs: Buffer[]): Promise<Buffer> {
    const inputFields = inputs.map(i => Fr.fromBuffer(i));
    return (await pedersenHash(inputFields)).toBuffer();
  }
}
