import {
  AVM_ACCUMULATED_DATA_LENGTH,
  MAX_L2_TO_L1_MSGS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_PUBLIC_LOGS_PER_TX,
  MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
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
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';

import { inspect } from 'util';
import { z } from 'zod';

import { PublicLog } from '../logs/public_log.js';
import { ScopedL2ToL1Message } from '../messaging/l2_to_l1_message.js';
import { PublicDataWrite } from './public_data_write.js';

export class AvmAccumulatedData {
  constructor(
    /**
     * The note hashes from private combining with those made in the AVM execution.
     */
    public noteHashes: Tuple<Fr, typeof MAX_NOTE_HASHES_PER_TX>,
    /**
     * The nullifiers from private combining with those made in the AVM execution.
     */
    public nullifiers: Tuple<Fr, typeof MAX_NULLIFIERS_PER_TX>,
    /**
     * The L2 to L1 messages from private combining with those made in the AVM execution.
     */
    public l2ToL1Msgs: Tuple<ScopedL2ToL1Message, typeof MAX_L2_TO_L1_MSGS_PER_TX>,
    /**
     * The public logs emitted from the AVM execution.
     */
    public publicLogs: Tuple<PublicLog, typeof MAX_PUBLIC_LOGS_PER_TX>,
    /**
     * The public data writes made in the AVM execution.
     */
    public publicDataWrites: Tuple<PublicDataWrite, typeof MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX>,
  ) {}

  static get schema() {
    return z
      .object({
        noteHashes: schemas.Fr.array().min(MAX_NOTE_HASHES_PER_TX).max(MAX_NOTE_HASHES_PER_TX),
        nullifiers: schemas.Fr.array().min(MAX_NULLIFIERS_PER_TX).max(MAX_NULLIFIERS_PER_TX),
        l2ToL1Msgs: ScopedL2ToL1Message.schema.array().min(MAX_L2_TO_L1_MSGS_PER_TX).max(MAX_L2_TO_L1_MSGS_PER_TX),
        publicLogs: PublicLog.schema.array().min(MAX_PUBLIC_LOGS_PER_TX).max(MAX_PUBLIC_LOGS_PER_TX),
        publicDataWrites: PublicDataWrite.schema
          .array()
          .min(MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX)
          .max(MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX),
      })
      .transform(
        ({ noteHashes, nullifiers, l2ToL1Msgs, publicLogs, publicDataWrites }) =>
          new AvmAccumulatedData(
            assertLength(noteHashes, MAX_NOTE_HASHES_PER_TX),
            assertLength(nullifiers, MAX_NULLIFIERS_PER_TX),
            assertLength(l2ToL1Msgs, MAX_L2_TO_L1_MSGS_PER_TX),
            assertLength(publicLogs, MAX_PUBLIC_LOGS_PER_TX),
            assertLength(publicDataWrites, MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX),
          ),
      );
  }

  getSize() {
    return (
      arraySerializedSizeOfNonEmpty(this.noteHashes) +
      arraySerializedSizeOfNonEmpty(this.nullifiers) +
      arraySerializedSizeOfNonEmpty(this.l2ToL1Msgs) +
      arraySerializedSizeOfNonEmpty(this.publicLogs) +
      arraySerializedSizeOfNonEmpty(this.publicDataWrites)
    );
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new this(
      reader.readArray(MAX_NOTE_HASHES_PER_TX, Fr),
      reader.readArray(MAX_NULLIFIERS_PER_TX, Fr),
      reader.readArray(MAX_L2_TO_L1_MSGS_PER_TX, ScopedL2ToL1Message),
      reader.readArray(MAX_PUBLIC_LOGS_PER_TX, PublicLog),
      reader.readArray(MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, PublicDataWrite),
    );
  }

  toBuffer() {
    return serializeToBuffer(this.noteHashes, this.nullifiers, this.l2ToL1Msgs, this.publicLogs, this.publicDataWrites);
  }

  static getFields(fields: FieldsOf<AvmAccumulatedData>) {
    return [
      fields.noteHashes,
      fields.nullifiers,
      fields.l2ToL1Msgs,
      fields.publicLogs,
      fields.publicDataWrites,
    ] as const;
  }

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    return new this(
      reader.readFieldArray(MAX_NOTE_HASHES_PER_TX),
      reader.readFieldArray(MAX_NULLIFIERS_PER_TX),
      reader.readArray(MAX_L2_TO_L1_MSGS_PER_TX, ScopedL2ToL1Message),
      reader.readArray(MAX_PUBLIC_LOGS_PER_TX, PublicLog),
      reader.readArray(MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, PublicDataWrite),
    );
  }

  toFields(): Fr[] {
    const fields = serializeToFields(...AvmAccumulatedData.getFields(this));
    if (fields.length !== AVM_ACCUMULATED_DATA_LENGTH) {
      throw new Error(
        `Invalid number of fields for AvmAccumulatedData. Expected ${AVM_ACCUMULATED_DATA_LENGTH}, got ${fields.length}`,
      );
    }
    return fields;
  }

  static fromString(str: string) {
    return this.fromBuffer(hexToBuffer(str));
  }

  toString() {
    return bufferToHex(this.toBuffer());
  }

  static empty() {
    return new this(
      makeTuple(MAX_NOTE_HASHES_PER_TX, Fr.zero),
      makeTuple(MAX_NULLIFIERS_PER_TX, Fr.zero),
      makeTuple(MAX_L2_TO_L1_MSGS_PER_TX, ScopedL2ToL1Message.empty),
      makeTuple(MAX_PUBLIC_LOGS_PER_TX, PublicLog.empty),
      makeTuple(MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, PublicDataWrite.empty),
    );
  }

  isEmpty(): boolean {
    return (
      this.noteHashes.every(x => x.isZero()) &&
      this.nullifiers.every(x => x.isZero()) &&
      this.l2ToL1Msgs.every(x => x.isEmpty()) &&
      this.publicLogs.every(x => x.isEmpty()) &&
      this.publicDataWrites.every(x => x.isEmpty())
    );
  }

  [inspect.custom]() {
    // print out the non-empty fields
    return `AvmAccumulatedData {
  noteHashes: [${this.noteHashes
    .filter(x => !x.isZero())
    .map(h => inspect(h))
    .join(', ')}],
  nullifiers: [${this.nullifiers
    .filter(x => !x.isZero())
    .map(h => inspect(h))
    .join(', ')}],
  l2ToL1Msgs: [${this.l2ToL1Msgs
    .filter(x => !x.isEmpty())
    .map(h => inspect(h))
    .join(', ')}],
  publicLogs: [${this.publicLogs
    .filter(x => !x.isEmpty())
    .map(h => inspect(h))
    .join(', ')}],
  publicDataWrites: [${this.publicDataWrites
    .filter(x => !x.isEmpty())
    .map(h => inspect(h))
    .join(', ')}],
}`;
  }
}
