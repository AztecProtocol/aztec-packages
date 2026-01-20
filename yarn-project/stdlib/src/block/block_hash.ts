import { Buffer32 } from '@aztec/foundation/buffer';
import { Fr } from '@aztec/foundation/curves/bn254';
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

  /**
   * Type guard that checks if a value is an L2BlockHash instance.
   * Uses duck typing to handle cases where instanceof fails due to module duplication.
   * Checks for Buffer32-like structure with a 32-byte buffer.
   */
  static isL2BlockHash(value: unknown): value is L2BlockHash {
    if (value instanceof L2BlockHash) {
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
