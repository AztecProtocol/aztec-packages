import { Buffer32 } from '@aztec/foundation/buffer';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader } from '@aztec/foundation/serialize';

import { schemas } from '../schemas/schemas.js';

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

  static override fromNumber(num: number): L2BlockHash {
    return new L2BlockHash(super.fromNumber(num).toBuffer());
  }

  static override fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new L2BlockHash(reader.readBytes(L2BlockHash.SIZE));
  }

  static override fromString(str: string): Buffer32 {
    return new L2BlockHash(super.fromString(str).toBuffer());
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
