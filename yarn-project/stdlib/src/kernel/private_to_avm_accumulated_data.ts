import {
  MAX_L2_TO_L1_MSGS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  PRIVATE_TO_AVM_ACCUMULATED_DATA_LENGTH,
} from '@aztec/constants';
import { type FieldsOf, makeTuple } from '@aztec/foundation/array';
import { arraySerializedSizeOfNonEmpty } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import { schemas } from '@aztec/foundation/schemas';
import {
  BufferReader,
  FieldReader,
  type Tuple,
  assertLength,
  serializeToBuffer,
  serializeToFields,
} from '@aztec/foundation/serialize';

import { inspect } from 'util';
import { z } from 'zod';

import { ScopedL2ToL1Message } from '../messaging/l2_to_l1_message.js';
import type { UInt32 } from '../types/shared.js';

export class PrivateToAvmAccumulatedData {
  constructor(
    public noteHashes: Tuple<Fr, typeof MAX_NOTE_HASHES_PER_TX>,
    public nullifiers: Tuple<Fr, typeof MAX_NULLIFIERS_PER_TX>,
    public l2ToL1Msgs: Tuple<ScopedL2ToL1Message, typeof MAX_L2_TO_L1_MSGS_PER_TX>,
  ) {}

  static get schema() {
    return z
      .object({
        noteHashes: schemas.Fr.array().min(MAX_NOTE_HASHES_PER_TX).max(MAX_NOTE_HASHES_PER_TX),
        nullifiers: schemas.Fr.array().min(MAX_NULLIFIERS_PER_TX).max(MAX_NULLIFIERS_PER_TX),
        l2ToL1Msgs: ScopedL2ToL1Message.schema.array().min(MAX_L2_TO_L1_MSGS_PER_TX).max(MAX_L2_TO_L1_MSGS_PER_TX),
      })
      .transform(
        ({ noteHashes, nullifiers, l2ToL1Msgs }) =>
          new PrivateToAvmAccumulatedData(
            assertLength(noteHashes, MAX_NOTE_HASHES_PER_TX),
            assertLength(nullifiers, MAX_NULLIFIERS_PER_TX),
            assertLength(l2ToL1Msgs, MAX_L2_TO_L1_MSGS_PER_TX),
          ),
      );
  }

  getSize() {
    return (
      arraySerializedSizeOfNonEmpty(this.noteHashes) +
      arraySerializedSizeOfNonEmpty(this.nullifiers) +
      arraySerializedSizeOfNonEmpty(this.l2ToL1Msgs)
    );
  }

  static getFields(fields: FieldsOf<PrivateToAvmAccumulatedData>) {
    return [fields.noteHashes, fields.nullifiers, fields.l2ToL1Msgs] as const;
  }

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    return new this(
      reader.readFieldArray(MAX_NOTE_HASHES_PER_TX),
      reader.readFieldArray(MAX_NULLIFIERS_PER_TX),
      reader.readArray(MAX_L2_TO_L1_MSGS_PER_TX, ScopedL2ToL1Message),
    );
  }

  toFields(): Fr[] {
    const fields = serializeToFields(...PrivateToAvmAccumulatedData.getFields(this));
    if (fields.length !== PRIVATE_TO_AVM_ACCUMULATED_DATA_LENGTH) {
      throw new Error(
        `Invalid number of fields for PrivateToAvmAccumulatedData. Expected ${PRIVATE_TO_AVM_ACCUMULATED_DATA_LENGTH}, got ${fields.length}`,
      );
    }
    return fields;
  }

  static from(fields: FieldsOf<PrivateToAvmAccumulatedData>) {
    return new PrivateToAvmAccumulatedData(...PrivateToAvmAccumulatedData.getFields(fields));
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new PrivateToAvmAccumulatedData(
      reader.readArray(MAX_NOTE_HASHES_PER_TX, Fr),
      reader.readArray(MAX_NULLIFIERS_PER_TX, Fr),
      reader.readArray(MAX_L2_TO_L1_MSGS_PER_TX, ScopedL2ToL1Message),
    );
  }

  toBuffer() {
    return serializeToBuffer(...PrivateToAvmAccumulatedData.getFields(this));
  }

  static empty() {
    return new PrivateToAvmAccumulatedData(
      makeTuple(MAX_NOTE_HASHES_PER_TX, Fr.zero),
      makeTuple(MAX_NULLIFIERS_PER_TX, Fr.zero),
      makeTuple(MAX_L2_TO_L1_MSGS_PER_TX, ScopedL2ToL1Message.empty),
    );
  }

  [inspect.custom]() {
    return `PrivateToAvmAccumulatedData {
      noteHashes: [${this.noteHashes
        .filter(x => !x.isZero())
        .map(x => inspect(x))
        .join(', ')}],
      nullifiers: [${this.nullifiers
        .filter(x => !x.isZero())
        .map(x => inspect(x))
        .join(', ')}],
      l2ToL1Msgs: [${this.l2ToL1Msgs
        .filter(x => !x.isEmpty())
        .map(x => inspect(x))
        .join(', ')}],
    }`;
  }
}

export class PrivateToAvmAccumulatedDataArrayLengths {
  constructor(
    public noteHashes: UInt32,
    public nullifiers: UInt32,
    public l2ToL1Msgs: UInt32,
  ) {}

  static get schema() {
    return z
      .object({
        noteHashes: schemas.UInt32,
        nullifiers: schemas.UInt32,
        l2ToL1Msgs: schemas.UInt32,
      })
      .transform(
        ({ noteHashes, nullifiers, l2ToL1Msgs }) =>
          new PrivateToAvmAccumulatedDataArrayLengths(noteHashes, nullifiers, l2ToL1Msgs),
      );
  }

  getSize() {
    return 4 * 3;
  }

  static getFields(fields: FieldsOf<PrivateToAvmAccumulatedDataArrayLengths>) {
    return [fields.noteHashes, fields.nullifiers, fields.l2ToL1Msgs] as const;
  }

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    return new this(reader.readU32(), reader.readU32(), reader.readU32());
  }

  toFields() {
    return [this.noteHashes, this.nullifiers, this.l2ToL1Msgs];
  }

  static from(fields: FieldsOf<PrivateToAvmAccumulatedDataArrayLengths>) {
    return new PrivateToAvmAccumulatedDataArrayLengths(...PrivateToAvmAccumulatedDataArrayLengths.getFields(fields));
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new PrivateToAvmAccumulatedDataArrayLengths(reader.readNumber(), reader.readNumber(), reader.readNumber());
  }

  toBuffer() {
    return serializeToBuffer(...PrivateToAvmAccumulatedDataArrayLengths.getFields(this));
  }

  static empty() {
    return new PrivateToAvmAccumulatedDataArrayLengths(0, 0, 0);
  }

  [inspect.custom]() {
    return `PrivateToAvmAccumulatedDataArrayLengths {
      noteHashes: ${this.noteHashes},
      nullifiers: ${this.nullifiers},
      l2ToL1Msgs: ${this.l2ToL1Msgs},
    }`;
  }
}
