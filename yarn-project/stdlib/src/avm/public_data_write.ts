import { PUBLIC_DATA_WRITE_LENGTH } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { schemas } from '@aztec/foundation/schemas';
import { BufferReader, FieldReader, serializeToBuffer, serializeToFields } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';
import type { FieldsOf } from '@aztec/foundation/types';

import { z } from 'zod';

/**
 * Write operations on the public state tree.
 */
export class PublicDataWrite {
  static SIZE_IN_BYTES = Fr.SIZE_IN_BYTES * 2;

  constructor(
    /**
     * The updated leaf.
     */
    public readonly leafSlot: Fr,
    /**
     * New value of the leaf.
     */
    public readonly value: Fr,
  ) {}

  static get schema() {
    return z
      .object({
        leafSlot: schemas.Fr,
        value: schemas.Fr,
      })
      .transform(PublicDataWrite.from);
  }

  static from(fields: FieldsOf<PublicDataWrite>) {
    return new PublicDataWrite(...PublicDataWrite.getFields(fields));
  }

  static getFields(fields: FieldsOf<PublicDataWrite>) {
    return [fields.leafSlot, fields.value] as const;
  }

  static fromFields(fields: Fr[] | FieldReader): PublicDataWrite {
    const reader = FieldReader.asReader(fields);
    return new PublicDataWrite(reader.readField(), reader.readField());
  }

  toFields(): Fr[] {
    const fields = serializeToFields(...PublicDataWrite.getFields(this));
    if (fields.length !== PUBLIC_DATA_WRITE_LENGTH) {
      throw new Error(
        `Invalid number of fields for PublicDataWrite. Expected ${PUBLIC_DATA_WRITE_LENGTH}, got ${fields.length}`,
      );
    }
    return fields;
  }

  static fromBlobFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    return new PublicDataWrite(reader.readField(), reader.readField());
  }

  toBlobFields(): Fr[] {
    return [this.leafSlot, this.value];
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new PublicDataWrite(Fr.fromBuffer(reader), Fr.fromBuffer(reader));
  }

  toBuffer() {
    return serializeToBuffer(...PublicDataWrite.getFields(this));
  }

  static fromString(str: string) {
    return PublicDataWrite.fromBuffer(hexToBuffer(str));
  }

  toString() {
    return bufferToHex(this.toBuffer());
  }

  static empty() {
    return new PublicDataWrite(Fr.ZERO, Fr.ZERO);
  }

  static random() {
    return new PublicDataWrite(Fr.random(), Fr.random());
  }

  static isEmpty(data: PublicDataWrite): boolean {
    return data.isEmpty();
  }

  isEmpty() {
    return this.leafSlot.isZero() && this.value.isZero();
  }

  equals(other: PublicDataWrite): boolean {
    return this.leafSlot.equals(other.leafSlot) && this.value.equals(other.value);
  }
}
