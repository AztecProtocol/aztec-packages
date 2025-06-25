import {
  MAX_KEY_VALIDATION_REQUESTS_PER_TX,
  MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
  MAX_NULLIFIER_READ_REQUESTS_PER_TX,
} from '@aztec/constants';
import { makeTuple } from '@aztec/foundation/array';
import { arraySerializedSizeOfNonEmpty } from '@aztec/foundation/collection';
import type { Fr } from '@aztec/foundation/fields';
import { BufferReader, FieldReader, type Tuple, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';

import { inspect } from 'util';

import { ScopedKeyValidationRequestAndGenerator } from '../kernel/hints/scoped_key_validation_request_and_generator.js';
import { ClaimedLengthArray } from './claimed_length_array.js';
import { ScopedReadRequest } from './hints/read_request.js';
import { RollupValidationRequests } from './hints/rollup_validation_requests.js';
import { OptionalNumber } from './utils/optional_number.js';

/**
 * Validation requests accumulated during the execution of the transaction.
 */
export class PrivateValidationRequests {
  constructor(
    /**
     * Validation requests that cannot be fulfilled in the current context (private or public), and must be instead be
     * forwarded to the rollup for it to take care of them.
     */
    public forRollup: RollupValidationRequests,
    /**
     * All the read requests made in this transaction.
     */
    public noteHashReadRequests: ClaimedLengthArray<ScopedReadRequest, typeof MAX_NOTE_HASH_READ_REQUESTS_PER_TX>,
    /**
     * All the nullifier read requests made in this transaction.
     */
    public nullifierReadRequests: ClaimedLengthArray<ScopedReadRequest, typeof MAX_NULLIFIER_READ_REQUESTS_PER_TX>,
    /**
     * All the key validation requests made in this transaction.
     */
    public scopedKeyValidationRequestsAndGenerators: ClaimedLengthArray<
      ScopedKeyValidationRequestAndGenerator,
      typeof MAX_KEY_VALIDATION_REQUESTS_PER_TX
    >,
    /**
     * The counter to split the data for squashing.
     * A revertible nullifier and a non-revertible note hash will not be squashed.
     * It should be the "final" minRevertibleSideEffectCounter of a tx.
     */
    public splitCounter: OptionalNumber,
  ) {}

  getSize() {
    return (
      this.forRollup.getSize() +
      this.noteHashReadRequests.length +
      this.nullifierReadRequests.length +
      this.scopedKeyValidationRequestsAndGenerators.length +
      this.splitCounter.getSize()
    );
  }

  toBuffer() {
    return serializeToBuffer(
      this.forRollup,
      this.noteHashReadRequests,
      this.nullifierReadRequests,
      this.scopedKeyValidationRequestsAndGenerators,
      this.splitCounter,
    );
  }

  toString() {
    return bufferToHex(this.toBuffer());
  }

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    return new PrivateValidationRequests(
      reader.readObject(RollupValidationRequests),
      reader.readObject({
        fromFields: (reader: FieldReader) =>
          ClaimedLengthArray.fromFields(reader, MAX_NOTE_HASH_READ_REQUESTS_PER_TX, ScopedReadRequest),
      }),
      reader.readObject({
        fromFields: (reader: FieldReader) =>
          ClaimedLengthArray.fromFields(reader, MAX_NULLIFIER_READ_REQUESTS_PER_TX, ScopedReadRequest),
      }),
      reader.readObject({
        fromFields: (reader: FieldReader) =>
          ClaimedLengthArray.fromFields(
            reader,
            MAX_KEY_VALIDATION_REQUESTS_PER_TX,
            ScopedKeyValidationRequestAndGenerator,
          ),
      }),
      reader.readObject(OptionalNumber),
    );
  }

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer or reader to read from.
   * @returns Deserialized object.
   */
  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new PrivateValidationRequests(
      reader.readObject(RollupValidationRequests),
      reader.readObject({
        fromBuffer: (reader: BufferReader) =>
          ClaimedLengthArray.fromBuffer(reader, MAX_NOTE_HASH_READ_REQUESTS_PER_TX, ScopedReadRequest),
      }),
      reader.readObject({
        fromBuffer: (reader: BufferReader) =>
          ClaimedLengthArray.fromBuffer(reader, MAX_NULLIFIER_READ_REQUESTS_PER_TX, ScopedReadRequest),
      }),
      reader.readObject({
        fromBuffer: (reader: BufferReader) =>
          ClaimedLengthArray.fromBuffer(
            reader,
            MAX_KEY_VALIDATION_REQUESTS_PER_TX,
            ScopedKeyValidationRequestAndGenerator,
          ),
      }),
      reader.readObject(OptionalNumber),
    );
  }

  /**
   * Deserializes from a string, corresponding to a write in cpp.
   * @param str - String to read from.
   * @returns Deserialized object.
   */
  static fromString(str: string) {
    return PrivateValidationRequests.fromBuffer(hexToBuffer(str));
  }

  static empty() {
    return new PrivateValidationRequests(
      RollupValidationRequests.empty(),
      ClaimedLengthArray.empty(MAX_NOTE_HASH_READ_REQUESTS_PER_TX, ScopedReadRequest.empty),
      ClaimedLengthArray.empty(MAX_NULLIFIER_READ_REQUESTS_PER_TX, ScopedReadRequest.empty),
      ClaimedLengthArray.empty(MAX_KEY_VALIDATION_REQUESTS_PER_TX, ScopedKeyValidationRequestAndGenerator.empty),
      OptionalNumber.empty(),
    );
  }

  [inspect.custom]() {
    return `PrivateValidationRequests {
  forRollup: ${inspect(this.forRollup)},
  noteHashReadRequests: {
    array: [${this.noteHashReadRequests.array
      .filter(x => !x.isEmpty())
      .map(h => inspect(h))
      .join(', ')}],
    length: ${this.noteHashReadRequests.length},
  },
  nullifierReadRequests: {
    array: [${this.nullifierReadRequests.array
      .filter(x => !x.isEmpty())
      .map(h => inspect(h))
      .join(', ')}],
    length: ${this.nullifierReadRequests.length},
  },
  scopedKeyValidationRequestsAndGenerators: {
    array: [${this.scopedKeyValidationRequestsAndGenerators.array
      .filter(x => !x.isEmpty())
      .map(h => inspect(h))
      .join(', ')}],
    length: ${this.scopedKeyValidationRequestsAndGenerators.length},
  }
  splitCounter: ${this.splitCounter.getSize()}
  `;
  }
}
