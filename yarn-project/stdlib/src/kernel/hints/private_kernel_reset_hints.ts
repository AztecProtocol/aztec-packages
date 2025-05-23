import { BufferReader, type Tuple, serializeToBuffer } from '@aztec/foundation/serialize';

import { KeyValidationHint } from './key_validation_hint.js';
import { type NoteHashReadRequestHints, noteHashReadRequestHintsFromBuffer } from './note_hash_read_request_hints.js';
import { type NullifierReadRequestHints, nullifierReadRequestHintsFromBuffer } from './nullifier_read_request_hints.js';
import { TransientDataIndexHint } from './transient_data_index_hint.js';

export class PrivateKernelResetHints<
  NH_RR_PENDING extends number,
  NH_RR_SETTLED extends number,
  NLL_RR_PENDING extends number,
  NLL_RR_SETTLED extends number,
  KEY_VALIDATION_HINTS_LEN extends number,
  TRANSIENT_DATA_HINTS_LEN extends number,
> {
  constructor(
    /**
     * Contains hints for the transient read requests to localize corresponding commitments.
     */
    public noteHashReadRequestHints: NoteHashReadRequestHints<NH_RR_PENDING, NH_RR_SETTLED>,
    /**
     * Contains hints for the nullifier read requests to locate corresponding pending or settled nullifiers.
     */
    public nullifierReadRequestHints: NullifierReadRequestHints<NLL_RR_PENDING, NLL_RR_SETTLED>,
    /**
     * Contains hints for key validation request.
     */
    public keyValidationHints: Tuple<KeyValidationHint, KEY_VALIDATION_HINTS_LEN>,
    /**
     * Contains hints for the transient note hashes to locate corresponding nullifiers.
     */
    public transientDataIndexHints: Tuple<TransientDataIndexHint, TRANSIENT_DATA_HINTS_LEN>,
    /**
     * The "final" minRevertibleSideEffectCounter of a tx, to split the data for squashing.
     * Not the minRevertibleSideEffectCounter at the point the reset circuit is run.
     */
    public validationRequestsSplitCounter: number,
  ) {}

  toBuffer() {
    return serializeToBuffer(
      this.noteHashReadRequestHints,
      this.nullifierReadRequestHints,
      this.keyValidationHints,
      this.transientDataIndexHints,
      this.validationRequestsSplitCounter,
    );
  }

  trimToSizes(
    numNoteHashReadRequestPending: number,
    numNoteHashReadRequestSettled: number,
    numNullifierReadRequestPending: number,
    numNullifierReadRequestSettled: number,
    numKeyValidationHints: number,
    numTransientDataIndexHints: number,
  ) {
    // Noir does not allow empty arrays. So we make the minimum array size 1.
    // There is a constant for each dimension, coded in the circuit that indicates how many hints should be applied.
    // The circuit is selected based on the dimension sizes, not the hint array sizes created here.
    const useSize = (num: number) => Math.max(num, 1);

    return new PrivateKernelResetHints(
      this.noteHashReadRequestHints.trimToSizes(
        useSize(numNoteHashReadRequestPending),
        useSize(numNoteHashReadRequestSettled),
      ),
      this.nullifierReadRequestHints.trimToSizes(
        useSize(numNullifierReadRequestPending),
        useSize(numNullifierReadRequestSettled),
      ),
      this.keyValidationHints.slice(0, useSize(numKeyValidationHints)),
      this.transientDataIndexHints.slice(0, useSize(numTransientDataIndexHints)),
      this.validationRequestsSplitCounter,
    );
  }
  /**
   * Deserializes from a buffer or reader.
   * @param buffer - Buffer or reader to read from.
   * @returns The deserialized instance.
   */
  static fromBuffer<
    NH_RR_PENDING extends number,
    NH_RR_SETTLED extends number,
    NLL_RR_PENDING extends number,
    NLL_RR_SETTLED extends number,
    KEY_VALIDATION_HINTS_LEN extends number,
    TRANSIENT_DATA_HINTS_LEN extends number,
  >(
    buffer: Buffer | BufferReader,
    numNoteHashReadRequestPending: NH_RR_PENDING,
    numNoteHashReadRequestSettled: NH_RR_SETTLED,
    numNullifierReadRequestPending: NLL_RR_PENDING,
    numNullifierReadRequestSettled: NLL_RR_SETTLED,
    numKeyValidationHints: KEY_VALIDATION_HINTS_LEN,
    numTransientDataIndexHints: TRANSIENT_DATA_HINTS_LEN,
  ): PrivateKernelResetHints<
    NH_RR_PENDING,
    NH_RR_SETTLED,
    NLL_RR_PENDING,
    NLL_RR_SETTLED,
    KEY_VALIDATION_HINTS_LEN,
    TRANSIENT_DATA_HINTS_LEN
  > {
    const reader = BufferReader.asReader(buffer);
    return new PrivateKernelResetHints(
      reader.readObject({
        fromBuffer: buf =>
          noteHashReadRequestHintsFromBuffer(buf, numNoteHashReadRequestPending, numNoteHashReadRequestSettled),
      }),
      reader.readObject({
        fromBuffer: buf =>
          nullifierReadRequestHintsFromBuffer(buf, numNullifierReadRequestPending, numNullifierReadRequestSettled),
      }),
      reader.readArray(numKeyValidationHints, KeyValidationHint),
      reader.readArray(numTransientDataIndexHints, TransientDataIndexHint),
      reader.readNumber(),
    );
  }
}
