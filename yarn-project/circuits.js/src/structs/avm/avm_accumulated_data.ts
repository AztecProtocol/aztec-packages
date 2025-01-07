import { makeTuple } from '@aztec/foundation/array';
import { arraySerializedSizeOfNonEmpty } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, FieldReader, type Tuple, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';

import { inspect } from 'util';

import {
  MAX_L2_TO_L1_MSGS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  MAX_UNENCRYPTED_LOGS_PER_TX,
} from '../../constants.gen.js';
import { ScopedL2ToL1Message } from '../l2_to_l1_message.js';
import { ScopedLogHash } from '../log_hash.js';
import { PublicDataWrite } from '../public_data_write.js';

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
     * The unencrypted logs emitted from the AVM execution.
     */
    public unencryptedLogsHashes: Tuple<ScopedLogHash, typeof MAX_UNENCRYPTED_LOGS_PER_TX>,
    /**
     * The public data writes made in the AVM execution.
     */
    public publicDataWrites: Tuple<PublicDataWrite, typeof MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX>,
  ) {}

  getSize() {
    return (
      arraySerializedSizeOfNonEmpty(this.noteHashes) +
      arraySerializedSizeOfNonEmpty(this.nullifiers) +
      arraySerializedSizeOfNonEmpty(this.l2ToL1Msgs) +
      arraySerializedSizeOfNonEmpty(this.unencryptedLogsHashes) +
      arraySerializedSizeOfNonEmpty(this.publicDataWrites)
    );
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new this(
      reader.readArray(MAX_NOTE_HASHES_PER_TX, Fr),
      reader.readArray(MAX_NULLIFIERS_PER_TX, Fr),
      reader.readArray(MAX_L2_TO_L1_MSGS_PER_TX, ScopedL2ToL1Message),
      reader.readArray(MAX_UNENCRYPTED_LOGS_PER_TX, ScopedLogHash),
      reader.readArray(MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, PublicDataWrite),
    );
  }

  toBuffer() {
    return serializeToBuffer(
      this.noteHashes,
      this.nullifiers,
      this.l2ToL1Msgs,
      this.unencryptedLogsHashes,
      this.publicDataWrites,
    );
  }

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    return new this(
      reader.readFieldArray(MAX_NOTE_HASHES_PER_TX),
      reader.readFieldArray(MAX_NULLIFIERS_PER_TX),
      reader.readArray(MAX_L2_TO_L1_MSGS_PER_TX, ScopedL2ToL1Message),
      reader.readArray(MAX_UNENCRYPTED_LOGS_PER_TX, ScopedLogHash),
      reader.readArray(MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, PublicDataWrite),
    );
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
      makeTuple(MAX_UNENCRYPTED_LOGS_PER_TX, ScopedLogHash.empty),
      makeTuple(MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, PublicDataWrite.empty),
    );
  }

  isEmpty(): boolean {
    return (
      this.noteHashes.every(x => x.isZero()) &&
      this.nullifiers.every(x => x.isZero()) &&
      this.l2ToL1Msgs.every(x => x.isEmpty()) &&
      this.unencryptedLogsHashes.every(x => x.isEmpty()) &&
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
  unencryptedLogsHashes: [${this.unencryptedLogsHashes
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
