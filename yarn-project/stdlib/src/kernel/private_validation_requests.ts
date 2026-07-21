import {
  MAX_KEY_VALIDATION_REQUESTS_PER_TX,
  MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
  MAX_NULLIFIER_READ_REQUESTS_PER_TX,
} from '@aztec/constants';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';

import { inspect } from 'util';

import { ScopedKeyValidationRequestAndSeparator } from '../kernel/hints/scoped_key_validation_request_and_separator.js';
import { ClaimedLengthArray, ClaimedLengthArrayFromBuffer } from './claimed_length_array.js';
import { ScopedReadRequest } from './hints/read_request.js';

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
    public scopedKeyValidationRequestsAndSeparators: ClaimedLengthArray<
      ScopedKeyValidationRequestAndSeparator,
      typeof MAX_KEY_VALIDATION_REQUESTS_PER_TX
    >,
  ) {}

  getSize() {
    return (
      this.noteHashReadRequests.getSize() +
      this.nullifierReadRequests.getSize() +
      this.scopedKeyValidationRequestsAndSeparators.getSize()
    );
  }

  toBuffer() {
    return serializeToBuffer(
      this.noteHashReadRequests,
      this.nullifierReadRequests,
      this.scopedKeyValidationRequestsAndSeparators,
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
        ClaimedLengthArrayFromBuffer(ScopedKeyValidationRequestAndSeparator, MAX_KEY_VALIDATION_REQUESTS_PER_TX),
      ),
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
      ClaimedLengthArray.empty(ScopedKeyValidationRequestAndSeparator, MAX_KEY_VALIDATION_REQUESTS_PER_TX),
    );
  }

  [inspect.custom]() {
    return `PrivateValidationRequests {
  noteHashReadRequests: ${inspect(this.noteHashReadRequests)},
  nullifierReadRequests: ${inspect(this.nullifierReadRequests)},
  scopedKeyValidationRequestsAndSeparators: ${inspect(this.scopedKeyValidationRequestsAndSeparators)},
  `;
  }
}
