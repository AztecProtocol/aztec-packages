import { makeTuple } from '@aztec/foundation/array';
import { arraySerializedSizeOfNonEmpty } from '@aztec/foundation/collection';
import { type Fr } from '@aztec/foundation/fields';
import { BufferReader, FieldReader, type Tuple, serializeToBuffer } from '@aztec/foundation/serialize';

import { inspect } from 'util';

import {
  MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX,
  MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
  MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX,
  MAX_NULLIFIER_READ_REQUESTS_PER_TX,
  MAX_PUBLIC_DATA_READS_PER_TX,
  NUM_PUBLIC_VALIDATION_REQUEST_ARRAYS,
} from '../constants.gen.js';
import { countAccumulatedItems } from '../utils/index.js';
import { PublicDataRead } from './public_data_read.js';
import { ScopedReadRequest } from './read_request.js';
import { RollupValidationRequests } from './rollup_validation_requests.js';
import { TreeLeafReadRequest } from './tree_leaf_read_request.js';

/**
 * Validation requests accumulated during the execution of the transaction.
 */
export class PublicValidationRequests {
  constructor(
    /**
     * Validation requests that cannot be fulfilled in the current context (private or public), and must be instead be
     * forwarded to the rollup for it to take care of them.
     */
    public forRollup: RollupValidationRequests,
    public noteHashReadRequests: Tuple<TreeLeafReadRequest, typeof MAX_NOTE_HASH_READ_REQUESTS_PER_TX>,
    /**
     * All the nullifier read requests made in this transaction.
     */
    public nullifierReadRequests: Tuple<ScopedReadRequest, typeof MAX_NULLIFIER_READ_REQUESTS_PER_TX>,
    /**
     * The nullifier read requests made in this transaction.
     */
    public nullifierNonExistentReadRequests: Tuple<
      ScopedReadRequest,
      typeof MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX
    >,
    public l1ToL2MsgReadRequests: Tuple<TreeLeafReadRequest, typeof MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX>,
    /**
     * All the public data reads made in this transaction.
     */
    public publicDataReads: Tuple<PublicDataRead, typeof MAX_PUBLIC_DATA_READS_PER_TX>,
  ) {}

  getSize() {
    return (
      this.forRollup.getSize() +
      arraySerializedSizeOfNonEmpty(this.noteHashReadRequests) +
      arraySerializedSizeOfNonEmpty(this.nullifierReadRequests) +
      arraySerializedSizeOfNonEmpty(this.nullifierNonExistentReadRequests) +
      arraySerializedSizeOfNonEmpty(this.l1ToL2MsgReadRequests) +
      arraySerializedSizeOfNonEmpty(this.publicDataReads)
    );
  }

  toBuffer() {
    return serializeToBuffer(
      this.forRollup,
      this.noteHashReadRequests,
      this.nullifierReadRequests,
      this.nullifierNonExistentReadRequests,
      this.l1ToL2MsgReadRequests,
      this.publicDataReads,
    );
  }

  toString() {
    return this.toBuffer().toString('hex');
  }

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    return new PublicValidationRequests(
      reader.readObject(RollupValidationRequests),
      reader.readArray(MAX_NOTE_HASH_READ_REQUESTS_PER_TX, TreeLeafReadRequest),
      reader.readArray(MAX_NULLIFIER_READ_REQUESTS_PER_TX, ScopedReadRequest),
      reader.readArray(MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX, ScopedReadRequest),
      reader.readArray(MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX, TreeLeafReadRequest),
      reader.readArray(MAX_PUBLIC_DATA_READS_PER_TX, PublicDataRead),
    );
  }

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer or reader to read from.
   * @returns Deserialized object.
   */
  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new PublicValidationRequests(
      reader.readObject(RollupValidationRequests),
      reader.readArray(MAX_NOTE_HASH_READ_REQUESTS_PER_TX, TreeLeafReadRequest),
      reader.readArray(MAX_NULLIFIER_READ_REQUESTS_PER_TX, ScopedReadRequest),
      reader.readArray(MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX, ScopedReadRequest),
      reader.readArray(MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX, TreeLeafReadRequest),
      reader.readArray(MAX_PUBLIC_DATA_READS_PER_TX, PublicDataRead),
    );
  }

  /**
   * Deserializes from a string, corresponding to a write in cpp.
   * @param str - String to read from.
   * @returns Deserialized object.
   */
  static fromString(str: string) {
    return PublicValidationRequests.fromBuffer(Buffer.from(str, 'hex'));
  }

  static empty() {
    return new PublicValidationRequests(
      RollupValidationRequests.empty(),
      makeTuple(MAX_NOTE_HASH_READ_REQUESTS_PER_TX, TreeLeafReadRequest.empty),
      makeTuple(MAX_NULLIFIER_READ_REQUESTS_PER_TX, ScopedReadRequest.empty),
      makeTuple(MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX, ScopedReadRequest.empty),
      makeTuple(MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX, TreeLeafReadRequest.empty),
      makeTuple(MAX_PUBLIC_DATA_READS_PER_TX, PublicDataRead.empty),
    );
  }

  [inspect.custom]() {
    return `PublicValidationRequests {
  forRollup: ${inspect(this.forRollup)},
  noteHashReadRequests: [${this.noteHashReadRequests
    .filter(x => !x.isEmpty())
    .map(h => inspect(h))
    .join(', ')}],
  nullifierReadRequests: [${this.nullifierReadRequests
    .filter(x => !x.isEmpty())
    .map(h => inspect(h))
    .join(', ')}],
  nullifierNonExistentReadRequests: [${this.nullifierNonExistentReadRequests
    .filter(x => !x.isEmpty())
    .map(h => inspect(h))
    .join(', ')}],
  l1ToL2MsgReadRequests: [${this.l1ToL2MsgReadRequests
    .filter(x => !x.isEmpty())
    .map(h => inspect(h))
    .join(', ')}],
  publicDataReads: [${this.publicDataReads
    .filter(x => !x.isEmpty())
    .map(h => inspect(h))
    .join(', ')}]
}`;
  }
}

export class PublicValidationRequestArrayLengths {
  constructor(
    public noteHashReadRequests: number,
    public nullifierReadRequests: number,
    public nullifierNonExistentReadRequests: number,
    public l1ToL2MsgReadRequests: number,
    public publicDataReads: number,
  ) {}

  static new(requests: PublicValidationRequests) {
    return new PublicValidationRequestArrayLengths(
      countAccumulatedItems(requests.noteHashReadRequests),
      countAccumulatedItems(requests.nullifierReadRequests),
      countAccumulatedItems(requests.nullifierNonExistentReadRequests),
      countAccumulatedItems(requests.l1ToL2MsgReadRequests),
      countAccumulatedItems(requests.publicDataReads),
    );
  }

  getSize() {
    return NUM_PUBLIC_VALIDATION_REQUEST_ARRAYS;
  }

  toBuffer() {
    return serializeToBuffer(
      this.noteHashReadRequests,
      this.nullifierReadRequests,
      this.nullifierNonExistentReadRequests,
      this.l1ToL2MsgReadRequests,
      this.publicDataReads,
    );
  }

  toString() {
    return this.toBuffer().toString('hex');
  }

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    return new PublicValidationRequestArrayLengths(
      reader.readU32(),
      reader.readU32(),
      reader.readU32(),
      reader.readU32(),
      reader.readU32(),
    );
  }

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer or reader to read from.
   * @returns Deserialized object.
   */
  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new PublicValidationRequestArrayLengths(
      reader.readNumber(),
      reader.readNumber(),
      reader.readNumber(),
      reader.readNumber(),
      reader.readNumber(),
    );
  }

  /**
   * Deserializes from a string, corresponding to a write in cpp.
   * @param str - String to read from.
   * @returns Deserialized object.
   */
  static fromString(str: string) {
    return PublicValidationRequestArrayLengths.fromBuffer(Buffer.from(str, 'hex'));
  }

  static empty() {
    return new PublicValidationRequestArrayLengths(0, 0, 0, 0, 0);
  }

  [inspect.custom]() {
    return `PublicValidationRequestArrayLengths {
  noteHashReadRequests: ${this.noteHashReadRequests},
  nullifierReadRequests: ${this.nullifierReadRequests},
  nullifierNonExistentReadRequests: ${this.nullifierNonExistentReadRequests},
  l1ToL2MsgReadRequests: ${this.l1ToL2MsgReadRequests},
  publicDataReads: ${this.publicDataReads}
}`;
  }
}
