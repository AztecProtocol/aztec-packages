import { Fr } from '@aztec/circuits.js';
import { Buffer32 } from '@aztec/foundation/buffer';
import { schemas } from '@aztec/foundation/schemas';

/**
 * A class representing hash of Aztec transaction.
 */
export class TxHash extends Buffer32 {
  constructor(
    /** The buffer containing the hash. */
    hash: Buffer,
  ) {
    super(hash);
  }

  /*
   * TxHashes are generated from the first nullifier of a transaction, which is a Fr.
   * Using Buffer32.random() could potentially generate invalid TxHashes.
   * @returns A random TxHash.
   */
  static override random() {
    return new TxHash(Fr.random().toBuffer());
  }

  static get schema() {
    return schemas.BufferHex.transform(value => new TxHash(value));
  }

  static zero() {
    return new TxHash(Buffer32.ZERO.toBuffer());
  }
}
