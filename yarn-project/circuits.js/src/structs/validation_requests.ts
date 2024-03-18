import { makeTuple } from '@aztec/foundation/array';
import { BufferReader, Tuple, serializeToBuffer } from '@aztec/foundation/serialize';

import {
  MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
  MAX_NULLIFIER_KEY_VALIDATION_REQUESTS_PER_TX,
  MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX,
  MAX_NULLIFIER_READ_REQUESTS_PER_TX,
  MAX_PUBLIC_DATA_READS_PER_TX,
} from '../constants.gen.js';
import { NullifierKeyValidationRequestContext } from './nullifier_key_validation_request.js';
import { PublicDataRead } from './public_data_read_request.js';
import { ReadRequestContext } from './read_request.js';
import { SideEffect } from './side_effects.js';

/**
 * Validation requests accumulated during the execution of the transaction.
 */
export class ValidationRequests {
  constructor(
    /**
     * All the read requests made in this transaction.
     */
    public noteHashReadRequests: Tuple<SideEffect, typeof MAX_NOTE_HASH_READ_REQUESTS_PER_TX>,
    /**
     * All the nullifier read requests made in this transaction.
     */
    public nullifierReadRequests: Tuple<ReadRequestContext, typeof MAX_NULLIFIER_READ_REQUESTS_PER_TX>,
    /**
     * The nullifier read requests made in this transaction.
     */
    public nullifierNonExistentReadRequests: Tuple<
      ReadRequestContext,
      typeof MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX
    >,
    /**
     * All the nullifier key validation requests made in this transaction.
     */
    public nullifierKeyValidationRequests: Tuple<
      NullifierKeyValidationRequestContext,
      typeof MAX_NULLIFIER_KEY_VALIDATION_REQUESTS_PER_TX
    >,
    /**
     * All the public data reads made in this transaction.
     */
    public publicDataReads: Tuple<PublicDataRead, typeof MAX_PUBLIC_DATA_READS_PER_TX>,
  ) {}

  toBuffer() {
    return serializeToBuffer(
      this.noteHashReadRequests,
      this.nullifierReadRequests,
      this.nullifierNonExistentReadRequests,
      this.nullifierKeyValidationRequests,
      this.publicDataReads,
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
  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new ValidationRequests(
      reader.readArray(MAX_NOTE_HASH_READ_REQUESTS_PER_TX, SideEffect),
      reader.readArray(MAX_NULLIFIER_READ_REQUESTS_PER_TX, ReadRequestContext),
      reader.readArray(MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX, ReadRequestContext),
      reader.readArray(MAX_NULLIFIER_KEY_VALIDATION_REQUESTS_PER_TX, NullifierKeyValidationRequestContext),
      reader.readArray(MAX_PUBLIC_DATA_READS_PER_TX, PublicDataRead),
    );
  }

  /**
   * Deserializes from a string, corresponding to a write in cpp.
   * @param str - String to read from.
   * @returns Deserialized object.
   */
  static fromString(str: string) {
    return ValidationRequests.fromBuffer(Buffer.from(str, 'hex'));
  }

  static empty() {
    return new ValidationRequests(
      makeTuple(MAX_NOTE_HASH_READ_REQUESTS_PER_TX, SideEffect.empty),
      makeTuple(MAX_NULLIFIER_READ_REQUESTS_PER_TX, ReadRequestContext.empty),
      makeTuple(MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX, ReadRequestContext.empty),
      makeTuple(MAX_NULLIFIER_KEY_VALIDATION_REQUESTS_PER_TX, NullifierKeyValidationRequestContext.empty),
      makeTuple(MAX_PUBLIC_DATA_READS_PER_TX, PublicDataRead.empty),
    );
  }
}
