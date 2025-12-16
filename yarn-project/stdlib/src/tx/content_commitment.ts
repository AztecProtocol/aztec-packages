import type { ViemContentCommitment } from '@aztec/ethereum';
import { Fr } from '@aztec/foundation/fields';
import { schemas } from '@aztec/foundation/schemas';
import { BufferReader, FieldReader, serializeToBuffer, serializeToFields } from '@aztec/foundation/serialize';
import { bufferToHex } from '@aztec/foundation/string';
import type { FieldsOf } from '@aztec/foundation/types';

import { z } from 'zod';

export class ContentCommitment {
  constructor(
    public blobsHash: Fr,
    public inHash: Fr,
    public outHash: Fr,
  ) {}

  static get schema() {
    return z
      .object({
        blobsHash: schemas.Fr,
        inHash: schemas.Fr,
        outHash: schemas.Fr,
      })
      .transform(({ blobsHash, inHash, outHash }) => new ContentCommitment(blobsHash, inHash, outHash));
  }

  static getFields(fields: FieldsOf<ContentCommitment>) {
    return [fields.blobsHash, fields.inHash, fields.outHash] as const;
  }

  getSize() {
    return this.toBuffer().length;
  }

  toBuffer() {
    return serializeToBuffer(...ContentCommitment.getFields(this));
  }

  static fromBuffer(buffer: Buffer | BufferReader): ContentCommitment {
    const reader = BufferReader.asReader(buffer);

    return new ContentCommitment(reader.readObject(Fr), reader.readObject(Fr), reader.readObject(Fr));
  }

  toInspect() {
    return {
      blobsHash: this.blobsHash.toString(),
      inHash: this.inHash.toString(),
      outHash: this.outHash.toString(),
    };
  }

  toViem(): ViemContentCommitment {
    return {
      blobsHash: this.blobsHash.toString(),
      inHash: this.inHash.toString(),
      outHash: this.outHash.toString(),
    };
  }

  static fromViem(contentCommitment: ViemContentCommitment) {
    return new ContentCommitment(
      Fr.fromString(contentCommitment.blobsHash),
      Fr.fromString(contentCommitment.inHash),
      Fr.fromString(contentCommitment.outHash),
    );
  }

  toFields(): Fr[] {
    return serializeToFields(...ContentCommitment.getFields(this));
  }

  static fromFields(fields: Fr[] | FieldReader): ContentCommitment {
    const reader = FieldReader.asReader(fields);
    return new ContentCommitment(reader.readField(), reader.readField(), reader.readField());
  }

  static empty(): ContentCommitment {
    return new ContentCommitment(Fr.zero(), Fr.zero(), Fr.zero());
  }

  isEmpty(): boolean {
    return this.blobsHash.isZero() && this.inHash.isZero() && this.outHash.isZero();
  }

  public toString(): string {
    return bufferToHex(this.toBuffer());
  }

  static fromString(str: string): ContentCommitment {
    const buffer = Buffer.from(str.replace(/^0x/i, ''), 'hex');
    return ContentCommitment.fromBuffer(buffer);
  }

  public equals(other: this): boolean {
    return (
      this.blobsHash.equals(other.blobsHash) && this.inHash.equals(other.inHash) && this.outHash.equals(other.outHash)
    );
  }
}
