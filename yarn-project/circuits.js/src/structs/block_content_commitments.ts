import { Fr } from '@aztec/foundation/fields';
import { BufferReader, FieldReader, from2Fields, serializeToBuffer, to2Fields } from '@aztec/foundation/serialize';

import { BLOCK_CONTENT_COMMITMENTS_LENGTH } from '../constants.gen.js';

export const NUM_BYTES_PER_SHA256 = 32;

export class BlockContentCommitments {
  constructor(public txTreeHeight: Fr, public txsHash: Buffer, public inHash: Buffer, public outHash: Buffer) {
    if (txsHash.length !== NUM_BYTES_PER_SHA256) {
      throw new Error(`txsHash buffer must be ${NUM_BYTES_PER_SHA256} bytes`);
    }
    if (inHash.length !== NUM_BYTES_PER_SHA256) {
      throw new Error(`inHash buffer must be ${NUM_BYTES_PER_SHA256} bytes`);
    }
    if (outHash.length !== NUM_BYTES_PER_SHA256) {
      throw new Error(`outHash buffer must be ${NUM_BYTES_PER_SHA256} bytes`);
    }
  }

  toBuffer() {
    return serializeToBuffer(this.txTreeHeight, this.txsHash, this.inHash, this.outHash);
  }

  toFields(): Fr[] {
    const serialized = [
      this.txTreeHeight,
      ...to2Fields(this.txsHash),
      ...to2Fields(this.inHash),
      ...to2Fields(this.outHash),
    ];
    if (serialized.length !== BLOCK_CONTENT_COMMITMENTS_LENGTH) {
      throw new Error(`Expected content commitment to have 4 fields, but it has ${serialized.length} fields`);
    }
    return serialized;
  }

  static fromBuffer(buffer: Buffer | BufferReader): BlockContentCommitments {
    const reader = BufferReader.asReader(buffer);

    return new BlockContentCommitments(
      reader.readObject(Fr),
      reader.readBytes(NUM_BYTES_PER_SHA256),
      reader.readBytes(NUM_BYTES_PER_SHA256),
      reader.readBytes(NUM_BYTES_PER_SHA256),
    );
  }

  static fromFields(fields: Fr[] | FieldReader): BlockContentCommitments {
    const reader = FieldReader.asReader(fields);
    return new BlockContentCommitments(
      reader.readField(),
      from2Fields(reader.readField(), reader.readField()),
      from2Fields(reader.readField(), reader.readField()),
      from2Fields(reader.readField(), reader.readField()),
    );
  }

  static empty(): BlockContentCommitments {
    return new BlockContentCommitments(
      Fr.zero(),
      Buffer.alloc(NUM_BYTES_PER_SHA256),
      Buffer.alloc(NUM_BYTES_PER_SHA256),
      Buffer.alloc(NUM_BYTES_PER_SHA256),
    );
  }

  isEmpty(): boolean {
    return (
      this.txTreeHeight.isZero() &&
      this.txsHash.equals(Buffer.alloc(NUM_BYTES_PER_SHA256)) &&
      this.inHash.equals(Buffer.alloc(NUM_BYTES_PER_SHA256)) &&
      this.outHash.equals(Buffer.alloc(NUM_BYTES_PER_SHA256))
    );
  }

  public toString(): string {
    return this.toBuffer().toString('hex');
  }

  static fromString(str: string): BlockContentCommitments {
    const buffer = Buffer.from(str.replace(/^0x/i, ''), 'hex');
    return BlockContentCommitments.fromBuffer(buffer);
  }
}
