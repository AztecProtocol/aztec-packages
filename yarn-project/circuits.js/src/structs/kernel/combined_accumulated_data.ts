import { type FieldsOf, makeTuple } from '@aztec/foundation/array';
import { arraySerializedSizeOfNonEmpty } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, type Tuple, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';

import { inspect } from 'util';

import {
  MAX_CONTRACT_CLASS_LOGS_PER_TX,
  MAX_L2_TO_L1_MSGS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_PRIVATE_LOGS_PER_TX,
  MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  MAX_UNENCRYPTED_LOGS_PER_TX,
} from '../../constants.gen.js';
import { ScopedL2ToL1Message } from '../l2_to_l1_message.js';
import { ScopedLogHash } from '../log_hash.js';
import { PrivateLog } from '../private_log.js';
import { PublicDataWrite } from '../public_data_write.js';

/**
 * Data that is accumulated during the execution of the transaction.
 */
export class CombinedAccumulatedData {
  constructor(
    /**
     * The new note hashes made in this transaction.
     */
    public noteHashes: Tuple<Fr, typeof MAX_NOTE_HASHES_PER_TX>,
    /**
     * The new nullifiers made in this transaction.
     */
    public nullifiers: Tuple<Fr, typeof MAX_NULLIFIERS_PER_TX>,
    /**
     * All the new L2 to L1 messages created in this transaction.
     */
    public l2ToL1Msgs: Tuple<ScopedL2ToL1Message, typeof MAX_L2_TO_L1_MSGS_PER_TX>,
    /**
     * All the logs created emitted from the private functions in this transaction.
     */
    public privateLogs: Tuple<PrivateLog, typeof MAX_PRIVATE_LOGS_PER_TX>,
    /**
     * Accumulated unencrypted logs hash from all the previous kernel iterations.
     * Note: Truncated to 31 bytes to fit in Fr.
     */
    public unencryptedLogsHashes: Tuple<ScopedLogHash, typeof MAX_UNENCRYPTED_LOGS_PER_TX>,
    /**
     * Accumulated contract class logs hash from all the previous kernel iterations.
     * Note: Truncated to 31 bytes to fit in Fr.
     */
    public contractClassLogsHashes: Tuple<ScopedLogHash, typeof MAX_CONTRACT_CLASS_LOGS_PER_TX>,
    /**
     * Total accumulated length of the unencrypted log preimages emitted in all the previous kernel iterations
     */
    public unencryptedLogPreimagesLength: Fr,
    /**
     * Total accumulated length of the contract class log preimages emitted in all the previous kernel iterations
     */
    public contractClassLogPreimagesLength: Fr,
    /**
     * All the public data update requests made in this transaction.
     */
    public publicDataWrites: Tuple<PublicDataWrite, typeof MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX>,
  ) {}

  getSize() {
    return (
      arraySerializedSizeOfNonEmpty(this.noteHashes) +
      arraySerializedSizeOfNonEmpty(this.nullifiers) +
      arraySerializedSizeOfNonEmpty(this.l2ToL1Msgs) +
      arraySerializedSizeOfNonEmpty(this.privateLogs) +
      arraySerializedSizeOfNonEmpty(this.unencryptedLogsHashes) +
      arraySerializedSizeOfNonEmpty(this.contractClassLogsHashes) +
      this.unencryptedLogPreimagesLength.size +
      this.contractClassLogPreimagesLength.size +
      arraySerializedSizeOfNonEmpty(this.publicDataWrites)
    );
  }

  static getFields(fields: FieldsOf<CombinedAccumulatedData>) {
    return [
      fields.noteHashes,
      fields.nullifiers,
      fields.l2ToL1Msgs,
      fields.privateLogs,
      fields.unencryptedLogsHashes,
      fields.contractClassLogsHashes,
      fields.unencryptedLogPreimagesLength,
      fields.contractClassLogPreimagesLength,
      fields.publicDataWrites,
    ] as const;
  }

  static from(fields: FieldsOf<CombinedAccumulatedData>): CombinedAccumulatedData {
    return new CombinedAccumulatedData(...CombinedAccumulatedData.getFields(fields));
  }

  static get schema() {
    return bufferSchemaFor(CombinedAccumulatedData);
  }

  toJSON() {
    return this.toBuffer();
  }

  toBuffer() {
    return serializeToBuffer(...CombinedAccumulatedData.getFields(this));
  }

  toString() {
    return bufferToHex(this.toBuffer());
  }

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer or reader to read from.
   * @returns Deserialized object.
   */
  static fromBuffer(buffer: Buffer | BufferReader): CombinedAccumulatedData {
    const reader = BufferReader.asReader(buffer);
    return new CombinedAccumulatedData(
      reader.readArray(MAX_NOTE_HASHES_PER_TX, Fr),
      reader.readArray(MAX_NULLIFIERS_PER_TX, Fr),
      reader.readArray(MAX_L2_TO_L1_MSGS_PER_TX, ScopedL2ToL1Message),
      reader.readArray(MAX_PRIVATE_LOGS_PER_TX, PrivateLog),
      reader.readArray(MAX_UNENCRYPTED_LOGS_PER_TX, ScopedLogHash),
      reader.readArray(MAX_CONTRACT_CLASS_LOGS_PER_TX, ScopedLogHash),
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
      reader.readArray(MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, PublicDataWrite),
    );
  }

  /**
   * Deserializes from a string, corresponding to a write in cpp.
   * @param str - String to read from.
   * @returns Deserialized object.
   */
  static fromString(str: string) {
    return CombinedAccumulatedData.fromBuffer(hexToBuffer(str));
  }

  static empty() {
    return new CombinedAccumulatedData(
      makeTuple(MAX_NOTE_HASHES_PER_TX, Fr.zero),
      makeTuple(MAX_NULLIFIERS_PER_TX, Fr.zero),
      makeTuple(MAX_L2_TO_L1_MSGS_PER_TX, ScopedL2ToL1Message.empty),
      makeTuple(MAX_PRIVATE_LOGS_PER_TX, PrivateLog.empty),
      makeTuple(MAX_UNENCRYPTED_LOGS_PER_TX, ScopedLogHash.empty),
      makeTuple(MAX_CONTRACT_CLASS_LOGS_PER_TX, ScopedLogHash.empty),
      Fr.zero(),
      Fr.zero(),
      makeTuple(MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, PublicDataWrite.empty),
    );
  }

  [inspect.custom]() {
    return `CombinedAccumulatedData {
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
      privateLogs:  [${this.privateLogs
        .filter(x => !x.isEmpty())
        .map(x => inspect(x))
        .join(', ')}]
      unencryptedLogsHashes: : [${this.unencryptedLogsHashes
        .filter(x => !x.isEmpty())
        .map(x => inspect(x))
        .join(', ')}],
      contractClassLogsHashes: : [${this.contractClassLogsHashes
        .filter(x => !x.isEmpty())
        .map(x => inspect(x))
        .join(', ')}],
      unencryptedLogPreimagesLength: ${this.unencryptedLogPreimagesLength.toString()},
      contractClassLogPreimagesLength: ${this.contractClassLogPreimagesLength.toString()},
      publicDataWrites: [${this.publicDataWrites
        .filter(x => !x.isEmpty())
        .map(x => inspect(x))
        .join(', ')}],
    }`;
  }
}
