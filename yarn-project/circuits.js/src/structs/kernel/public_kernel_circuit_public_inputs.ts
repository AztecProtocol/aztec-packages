import { makeTuple } from '@aztec/foundation/array';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { arrayNonEmptyLength } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, FieldReader, type Tuple, mapTuple, serializeToBuffer } from '@aztec/foundation/serialize';

import { inspect } from 'util';

import {
  MAX_ENCRYPTED_LOGS_PER_TX,
  MAX_NEW_L2_TO_L1_MSGS_PER_TX,
  MAX_NEW_NOTE_HASHES_PER_TX,
  MAX_NOTE_ENCRYPTED_LOGS_PER_TX,
  MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX,
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
} from '../../constants.gen.js';
import { mergeAccumulatedData, sortByCounterGetSortedHints } from '../../utils/index.js';
import { CallRequest } from '../call_request.js';
import { RevertCode } from '../revert_code.js';
import { ValidationRequests } from '../validation_requests.js';
import { CombineHints } from './combine_hints.js';
import { CombinedAccumulatedData } from './combined_accumulated_data.js';
import { CombinedConstantData } from './combined_constant_data.js';
import { PublicAccumulatedData } from './public_accumulated_data.js';

/**
 * Outputs from the public kernel circuits.
 * All Public kernels use this shape for outputs.
 */
export class PublicKernelCircuitPublicInputs {
  constructor(
    /**
     * Validation requests accumulated from public functions.
     */
    public validationRequests: ValidationRequests,
    /**
     * Accumulated side effects and enqueued calls that are not revertible.
     */
    public endNonRevertibleData: PublicAccumulatedData,
    /**
     * Data accumulated from both public and private circuits.
     */
    public end: PublicAccumulatedData,
    /**
     * Data which is not modified by the circuits.
     */
    public constants: CombinedConstantData,
    /**
     * Indicates whether execution of the public circuit reverted.
     */
    public revertCode: RevertCode,
    /**
     * The call request for the public teardown function
     */
    public publicTeardownCallStack: Tuple<CallRequest, typeof MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX>,
    /**
     * The address of the fee payer for the transaction
     */
    public feePayer: AztecAddress,
  ) {}

  toBuffer() {
    return serializeToBuffer(
      this.validationRequests,
      this.endNonRevertibleData,
      this.end,
      this.constants,
      this.revertCode,
      this.publicTeardownCallStack,
      this.feePayer,
    );
  }

  clone() {
    return PublicKernelCircuitPublicInputs.fromBuffer(this.toBuffer());
  }

  toString() {
    return this.toBuffer().toString('hex');
  }

  static fromString(str: string) {
    return PublicKernelCircuitPublicInputs.fromBuffer(Buffer.from(str, 'hex'));
  }

  get needsSetup() {
    return !this.endNonRevertibleData.publicCallStack[0].isEmpty();
  }

  get needsAppLogic() {
    return !this.end.publicCallStack[0].isEmpty();
  }

  get needsTeardown() {
    return !this.publicTeardownCallStack[0].isEmpty();
  }

  combineAndSortAccumulatedData(): {
    data: CombinedAccumulatedData;
    hints: CombineHints;
  } {
    const mergedNoteHashes = mergeAccumulatedData(
      this.endNonRevertibleData.newNoteHashes,
      this.end.newNoteHashes,
      MAX_NEW_NOTE_HASHES_PER_TX,
    );

    const newNoteHashes = mapTuple(mergedNoteHashes, n => n.value);

    const [sortedNoteHashes, sortedNoteHashesIndexes] = sortByCounterGetSortedHints(
      mergedNoteHashes,
      MAX_NEW_NOTE_HASHES_PER_TX,
    );

    const newNullifiers: Tuple<Fr, typeof MAX_NEW_NOTE_HASHES_PER_TX> = mapTuple(
      mergeAccumulatedData(this.endNonRevertibleData.newNullifiers, this.end.newNullifiers, MAX_NEW_NOTE_HASHES_PER_TX),
      n => n.value,
    );

    const newL2ToL1Msgs = mergeAccumulatedData(
      this.endNonRevertibleData.newL2ToL1Msgs,
      this.end.newL2ToL1Msgs,
      MAX_NEW_L2_TO_L1_MSGS_PER_TX,
    );

    const noteEncryptedLogHashes = mergeAccumulatedData(
      this.endNonRevertibleData.noteEncryptedLogsHashes,
      this.end.noteEncryptedLogsHashes,
      MAX_NOTE_ENCRYPTED_LOGS_PER_TX,
    );
    const noteEncryptedLogPreimagesLength = new Fr(arrayNonEmptyLength(noteEncryptedLogHashes, x => x.isEmpty()));

    const encryptedLogHashes = mergeAccumulatedData(
      this.endNonRevertibleData.encryptedLogsHashes,
      this.end.encryptedLogsHashes,
      MAX_ENCRYPTED_LOGS_PER_TX,
    );
    const encryptedLogPreimagesLength = new Fr(arrayNonEmptyLength(encryptedLogHashes, x => x.isEmpty()));

    const unencryptedLogHashes = mergeAccumulatedData(
      this.endNonRevertibleData.unencryptedLogsHashes,
      this.end.unencryptedLogsHashes,
      MAX_ENCRYPTED_LOGS_PER_TX,
    );

    const unencryptedLogPreimagesLength = new Fr(arrayNonEmptyLength(unencryptedLogHashes, x => x.isEmpty()));

    const publicDataUpdateRequests = mergeAccumulatedData(
      this.endNonRevertibleData.publicDataUpdateRequests,
      this.end.publicDataUpdateRequests,
      MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
    );

    const [sortedPublicDataUpdateRequests, sortedPublicDataUpdateRequestsIndexes] = sortByCounterGetSortedHints(
      publicDataUpdateRequests,
      MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
    );

    const gasUsed = this.endNonRevertibleData.gasUsed.add(this.end.gasUsed);

    const data = CombinedAccumulatedData.from({
      newNoteHashes,
      newNullifiers,
      newL2ToL1Msgs,
      noteEncryptedLogsHash: noteEncryptedLogHashes[0].value,
      noteEncryptedLogPreimagesLength,
      encryptedLogsHash: encryptedLogHashes[0].value,
      encryptedLogPreimagesLength,
      unencryptedLogsHash: unencryptedLogHashes[0].value,
      unencryptedLogPreimagesLength,
      publicDataUpdateRequests: sortedPublicDataUpdateRequests,
      gasUsed,
    });

    const hints = CombineHints.from({
      sortedNoteHashes,
      sortedNoteHashesIndexes,
      sortedPublicDataUpdateRequests,
      sortedPublicDataUpdateRequestsIndexes,
    });

    return {
      data,
      hints,
    };
  }

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer or reader to read from.
   * @returns A new instance of PublicKernelCircuitPublicInputs.
   */
  static fromBuffer(buffer: Buffer | BufferReader): PublicKernelCircuitPublicInputs {
    const reader = BufferReader.asReader(buffer);
    return new PublicKernelCircuitPublicInputs(
      reader.readObject(ValidationRequests),
      reader.readObject(PublicAccumulatedData),
      reader.readObject(PublicAccumulatedData),
      reader.readObject(CombinedConstantData),
      reader.readObject(RevertCode),
      reader.readArray(MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX, CallRequest),
      reader.readObject(AztecAddress),
    );
  }

  static empty() {
    return new PublicKernelCircuitPublicInputs(
      ValidationRequests.empty(),
      PublicAccumulatedData.empty(),
      PublicAccumulatedData.empty(),
      CombinedConstantData.empty(),
      RevertCode.OK,
      makeTuple(MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX, CallRequest.empty),
      AztecAddress.ZERO,
    );
  }

  static fromFields(fields: Fr[] | FieldReader): PublicKernelCircuitPublicInputs {
    const reader = FieldReader.asReader(fields);
    return new PublicKernelCircuitPublicInputs(
      ValidationRequests.fromFields(reader),
      PublicAccumulatedData.fromFields(reader),
      PublicAccumulatedData.fromFields(reader),
      CombinedConstantData.fromFields(reader),
      RevertCode.fromField(reader.readField()),
      reader.readArray(MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX, CallRequest),
      AztecAddress.fromFields(reader),
    );
  }

  [inspect.custom]() {
    return `PublicKernelCircuitPublicInputs {
      validationRequests: ${inspect(this.validationRequests)},
      endNonRevertibleData: ${inspect(this.endNonRevertibleData)},
      end: ${inspect(this.end)},
      constants: ${inspect(this.constants)},
      revertCode: ${this.revertCode},
      publicTeardownCallStack: ${inspect(this.publicTeardownCallStack)}
      feePayer: ${this.feePayer}
      }`;
  }
}
