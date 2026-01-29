import { Buffer32 } from '@aztec/foundation/buffer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { BufferReader } from '@aztec/foundation/serialize';

import { schemas } from '../schemas/schemas.js';

/** Hash of an L2 block. */
export class BlockHash extends Buffer32 {
  constructor(
    /** The buffer containing the hash. */
    hash: Buffer,
  ) {
    super(hash);
  }

  /**
   * Type guard that checks if a value is an BlockHash instance.
   * Uses duck typing to handle cases where instanceof fails due to module duplication.
   * Checks for Buffer32-like structure with a 32-byte buffer.
   */
  static isL2BlockHash(value: unknown): value is BlockHash {
    if (value instanceof BlockHash) {
      return true;
    }
    // Duck typing fallback: check if it looks like a Buffer32 with a 32-byte buffer
    // This helps when instanceof fails due to module duplication
    return (
      typeof value === 'object' &&
      value !== null &&
      'buffer' in value &&
      Buffer.isBuffer((value as Buffer32).buffer) &&
      (value as Buffer32).buffer.length === 32 &&
      'toBuffer' in value &&
      typeof (value as Buffer32).toBuffer === 'function'
    );
  }

  static override random() {
    return new BlockHash(Fr.random().toBuffer());
  }

  static override fromNumber(num: number): BlockHash {
    return new BlockHash(super.fromNumber(num).toBuffer());
  }

  static override fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new BlockHash(reader.readBytes(BlockHash.SIZE));
  }

  static override fromString(str: string): BlockHash {
    return new BlockHash(super.fromString(str).toBuffer());
  }

  static get schema() {
    return schemas.BufferHex.transform(value => new BlockHash(value));
  }

  static zero() {
    return new BlockHash(Buffer32.ZERO.toBuffer());
  }

  static override fromField(hash: Fr) {
    return new BlockHash(hash.toBuffer());
  }

  toField(): Fr {
    return Fr.fromBuffer(this.toBuffer());
  }
}
