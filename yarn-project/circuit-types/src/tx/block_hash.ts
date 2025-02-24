import { schemas } from '@aztec/circuits.js/schemas';
import { Buffer32 } from '@aztec/foundation/buffer';
import { Fr } from '@aztec/foundation/fields';

/** Hash of an L2 block. */
export class L2BlockHash extends Buffer32 {
  constructor(
    /** The buffer containing the hash. */
    hash: Buffer,
  ) {
    super(hash);
  }

  static override random() {
    return new L2BlockHash(Fr.random().toBuffer());
  }

  static get schema() {
    return schemas.BufferHex.transform(value => new L2BlockHash(value));
  }

  static zero() {
    return new L2BlockHash(Buffer32.ZERO.toBuffer());
  }

  static override fromField(hash: Fr) {
    return new L2BlockHash(hash.toBuffer());
  }
}
