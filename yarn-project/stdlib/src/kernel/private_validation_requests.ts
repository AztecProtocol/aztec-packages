import {
  MAX_KEY_VALIDATION_REQUESTS_PER_TX,
  MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
  MAX_NULLIFIER_READ_REQUESTS_PER_TX,
} from '@aztec/constants';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';

import { inspect } from 'util';

import { ScopedKeyValidationRequestAndGenerator } from '../kernel/hints/scoped_key_validation_request_and_generator.js';
import { ClaimedLengthArray, ClaimedLengthArrayFromBuffer } from './claimed_length_array.js';
import { ScopedReadRequest } from './hints/read_request.js';
import { OptionalNumber } from './utils/optional_number.js';

/**
 * Validation requests accumulated during the execution of the transaction.
 */
export class PrivateValidationRequests {
  constructor(
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
      this.noteHashReadRequests.getSize() +
      this.nullifierReadRequests.getSize() +
      this.scopedKeyValidationRequestsAndGenerators.getSize() +
      this.splitCounter.getSize()
    );
  }

  toBuffer() {
    return serializeToBuffer(
      this.noteHashReadRequests,
      this.nullifierReadRequests,
      this.scopedKeyValidationRequestsAndGenerators,
      this.splitCounter,
    );
  }

  toString() {
    return bufferToHex(this.toBuffer());
  }

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer or reader to read from.
   * @returns Deserialized object.
   */
  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new PrivateValidationRequests(
      reader.readObject(ClaimedLengthArrayFromBuffer(ScopedReadRequest, MAX_NOTE_HASH_READ_REQUESTS_PER_TX)),
      reader.readObject(ClaimedLengthArrayFromBuffer(ScopedReadRequest, MAX_NULLIFIER_READ_REQUESTS_PER_TX)),
      reader.readObject(
        ClaimedLengthArrayFromBuffer(ScopedKeyValidationRequestAndGenerator, MAX_KEY_VALIDATION_REQUESTS_PER_TX),
      ),
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
      ClaimedLengthArray.empty(ScopedReadRequest, MAX_NOTE_HASH_READ_REQUESTS_PER_TX),
      ClaimedLengthArray.empty(ScopedReadRequest, MAX_NULLIFIER_READ_REQUESTS_PER_TX),
      ClaimedLengthArray.empty(ScopedKeyValidationRequestAndGenerator, MAX_KEY_VALIDATION_REQUESTS_PER_TX),
      OptionalNumber.empty(),
    );
  }

  [inspect.custom]() {
    return `PrivateValidationRequests {
  noteHashReadRequests: ${inspect(this.noteHashReadRequests)},
  nullifierReadRequests: ${inspect(this.nullifierReadRequests)},
  scopedKeyValidationRequestsAndGenerators: ${inspect(this.scopedKeyValidationRequestsAndGenerators)},
  splitCounter: ${this.splitCounter.getSize()}
  `;
  }
}
