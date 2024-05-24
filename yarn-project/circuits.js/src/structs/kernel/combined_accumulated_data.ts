import { makeTuple } from '@aztec/foundation/array';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, type Tuple, serializeToBuffer } from '@aztec/foundation/serialize';

import { inspect } from 'util';

import {
  type MAX_NEW_L2_TO_L1_MSGS_PER_CALL,
  MAX_NEW_L2_TO_L1_MSGS_PER_TX,
  MAX_NEW_NOTE_HASHES_PER_TX,
  MAX_NEW_NULLIFIERS_PER_TX,
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
} from '../../constants.gen.js';
import { Gas } from '../gas.js';
import { PublicDataUpdateRequest } from '../public_data_update_request.js';

/**
 * Data that is accumulated during the execution of the transaction.
 */
export class CombinedAccumulatedData {
  constructor(
    /**
     * The new note hashes made in this transaction.
     */
    public newNoteHashes: Tuple<Fr, typeof MAX_NEW_NOTE_HASHES_PER_TX>,
    /**
     * The new nullifiers made in this transaction.
     */
    public newNullifiers: Tuple<Fr, typeof MAX_NEW_NULLIFIERS_PER_TX>,
    /**
     * All the new L2 to L1 messages created in this transaction.
     */
    public newL2ToL1Msgs: Tuple<Fr, typeof MAX_NEW_L2_TO_L1_MSGS_PER_CALL>,
    /**
     * Accumulated encrypted note logs hash from all the previous kernel iterations.
     * Note: Truncated to 31 bytes to fit in Fr.
     */
    public noteEncryptedLogsHash: Fr,
    /**
     * Accumulated encrypted logs hash from all the previous kernel iterations.
     * Note: Truncated to 31 bytes to fit in Fr.
     */
    public encryptedLogsHash: Fr,
    /**
     * Accumulated unencrypted logs hash from all the previous kernel iterations.
     * Note: Truncated to 31 bytes to fit in Fr.
     */
    public unencryptedLogsHash: Fr,
    /**
     * Total accumulated length of the encrypted note log preimages emitted in all the previous kernel iterations
     */
    public noteEncryptedLogPreimagesLength: Fr,
    /**
     * Total accumulated length of the encrypted log preimages emitted in all the previous kernel iterations
     */
    public encryptedLogPreimagesLength: Fr,
    /**
     * Total accumulated length of the unencrypted log preimages emitted in all the previous kernel iterations
     */
    public unencryptedLogPreimagesLength: Fr,
    /**
     * All the public data update requests made in this transaction.
     */
    public publicDataUpdateRequests: Tuple<PublicDataUpdateRequest, typeof MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX>,

    /** Gas used during this transaction */
    public gasUsed: Gas,
  ) {}

  toBuffer() {
    return serializeToBuffer(
      this.newNoteHashes,
      this.newNullifiers,
      this.newL2ToL1Msgs,
      this.noteEncryptedLogsHash,
      this.encryptedLogsHash,
      this.unencryptedLogsHash,
      this.noteEncryptedLogPreimagesLength,
      this.encryptedLogPreimagesLength,
      this.unencryptedLogPreimagesLength,
      this.publicDataUpdateRequests,
      this.gasUsed,
    );
  }

  toString() {
    return this.toBuffer().toString('hex');
  }

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer or reader to read from.
   * @returns Deserialized object.
   */
  static fromBuffer(buffer: Buffer | BufferReader): CombinedAccumulatedData {
    const reader = BufferReader.asReader(buffer);
    return new CombinedAccumulatedData(
      reader.readArray(MAX_NEW_NOTE_HASHES_PER_TX, Fr),
      reader.readArray(MAX_NEW_NULLIFIERS_PER_TX, Fr),
      reader.readArray(MAX_NEW_L2_TO_L1_MSGS_PER_TX, Fr),
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
      reader.readArray(MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, PublicDataUpdateRequest),
      reader.readObject(Gas),
    );
  }

  /**
   * Deserializes from a string, corresponding to a write in cpp.
   * @param str - String to read from.
   * @returns Deserialized object.
   */
  static fromString(str: string) {
    return CombinedAccumulatedData.fromBuffer(Buffer.from(str, 'hex'));
  }

  static empty() {
    return new CombinedAccumulatedData(
      makeTuple(MAX_NEW_NOTE_HASHES_PER_TX, Fr.zero),
      makeTuple(MAX_NEW_NULLIFIERS_PER_TX, Fr.zero),
      makeTuple(MAX_NEW_L2_TO_L1_MSGS_PER_TX, Fr.zero),
      Fr.zero(),
      Fr.zero(),
      Fr.zero(),
      Fr.zero(),
      Fr.zero(),
      Fr.zero(),
      makeTuple(MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, PublicDataUpdateRequest.empty),
      Gas.empty(),
    );
  }

  [inspect.custom]() {
    return `CombinedAccumulatedData {
      newNoteHashes: [${this.newNoteHashes
        .filter(x => !x.isZero())
        .map(x => inspect(x))
        .join(', ')}],
      newNullifiers: [${this.newNullifiers
        .filter(x => !x.isZero())
        .map(x => inspect(x))
        .join(', ')}],
      newL2ToL1Msgs: [${this.newL2ToL1Msgs
        .filter(x => !x.isZero())
        .map(x => inspect(x))
        .join(', ')}],
      noteEncryptedLogsHash: ${this.noteEncryptedLogsHash.toString()},
      encryptedLogsHash: ${this.encryptedLogsHash.toString()},
      unencryptedLogsHash: ${this.unencryptedLogsHash.toString()},
      noteEncryptedLogPreimagesLength: ${this.noteEncryptedLogPreimagesLength.toString()},
      encryptedLogPreimagesLength: ${this.encryptedLogPreimagesLength.toString()},
      unencryptedLogPreimagesLength: ${this.unencryptedLogPreimagesLength.toString()},
      publicDataUpdateRequests: [${this.publicDataUpdateRequests
        .filter(x => !x.isEmpty())
        .map(x => inspect(x))
        .join(', ')}],
      gasUsed: ${inspect(this.gasUsed)}
    }`;
  }
}
