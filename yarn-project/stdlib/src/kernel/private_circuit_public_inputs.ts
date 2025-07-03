import {
  MAX_CONTRACT_CLASS_LOGS_PER_CALL,
  MAX_ENQUEUED_CALLS_PER_CALL,
  MAX_KEY_VALIDATION_REQUESTS_PER_CALL,
  MAX_L2_TO_L1_MSGS_PER_CALL,
  MAX_NOTE_HASHES_PER_CALL,
  MAX_NOTE_HASH_READ_REQUESTS_PER_CALL,
  MAX_NULLIFIERS_PER_CALL,
  MAX_NULLIFIER_READ_REQUESTS_PER_CALL,
  MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL,
  MAX_PRIVATE_LOGS_PER_CALL,
} from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { bufferSchemaFor } from '@aztec/foundation/schemas';
import {
  BufferReader,
  FieldReader,
  bigintToUInt64BE,
  serializeToBuffer,
  serializeToFields,
} from '@aztec/foundation/serialize';
import type { FieldsOf } from '@aztec/foundation/types';

import { KeyValidationRequestAndGenerator } from '../kernel/hints/key_validation_request_and_generator.js';
import { CountedLogHash } from '../kernel/log_hash.js';
import { PrivateCallRequest } from '../kernel/private_call_request.js';
import { PrivateLogData } from '../kernel/private_log_data.js';
import { CountedL2ToL1Message } from '../messaging/l2_to_l1_message.js';
import { BlockHeader } from '../tx/block_header.js';
import { CallContext } from '../tx/call_context.js';
import { TxContext } from '../tx/tx_context.js';
import type { UInt64 } from '../types/shared.js';
import {
  ClaimedLengthArray,
  ClaimedLengthArrayFromBuffer,
  ClaimedLengthArrayFromFields,
} from './claimed_length_array.js';
import { ReadRequest } from './hints/read_request.js';
import { NoteHash } from './note_hash.js';
import { Nullifier } from './nullifier.js';
import { CountedPublicCallRequest, PublicCallRequest } from './public_call_request.js';

/**
 * Public inputs to a private circuit.
 */
export class PrivateCircuitPublicInputs {
  constructor(
    /**
     * Context of the call corresponding to this private circuit execution.
     */
    public callContext: CallContext,
    /**
     * Pedersen hash of function arguments.
     */
    public argsHash: Fr,
    /**
     * Pedersen hash of the return values of the corresponding function call.
     */
    public returnsHash: Fr,
    /**
     * The side-effect counter under which all side effects are non-revertible.
     */
    public minRevertibleSideEffectCounter: Fr,
    /**
     * Whether the caller of the function is the fee payer.
     */
    public isFeePayer: boolean,
    /**
     * The highest timestamp of a block in which the transaction can still be included.
     */
    public includeByTimestamp: UInt64,
    /**
     * Read requests created by the corresponding function call.
     */
    public noteHashReadRequests: ClaimedLengthArray<ReadRequest, typeof MAX_NOTE_HASH_READ_REQUESTS_PER_CALL>,
    /**
     * Nullifier read requests created by the corresponding function call.
     */
    public nullifierReadRequests: ClaimedLengthArray<ReadRequest, typeof MAX_NULLIFIER_READ_REQUESTS_PER_CALL>,
    /**
     * Key validation requests and generators created by the corresponding function call.
     */
    public keyValidationRequestsAndGenerators: ClaimedLengthArray<
      KeyValidationRequestAndGenerator,
      typeof MAX_KEY_VALIDATION_REQUESTS_PER_CALL
    >,
    /**
     * New note hashes created by the corresponding function call.
     */
    public noteHashes: ClaimedLengthArray<NoteHash, typeof MAX_NOTE_HASHES_PER_CALL>,
    /**
     * New nullifiers created by the corresponding function call.
     */
    public nullifiers: ClaimedLengthArray<Nullifier, typeof MAX_NULLIFIERS_PER_CALL>,
    /**
     * Private call requests made within the current kernel iteration.
     */
    public privateCallRequests: ClaimedLengthArray<PrivateCallRequest, typeof MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL>,
    /**
     * Public call stack at the current kernel iteration.
     */
    public publicCallRequests: ClaimedLengthArray<CountedPublicCallRequest, typeof MAX_ENQUEUED_CALLS_PER_CALL>,
    /**
     * Hash of the public teardown function.
     */
    public publicTeardownCallRequest: PublicCallRequest,
    /**
     * New L2 to L1 messages created by the corresponding function call.
     */
    public l2ToL1Msgs: ClaimedLengthArray<CountedL2ToL1Message, typeof MAX_L2_TO_L1_MSGS_PER_CALL>,
    /**
     * Logs emitted in this function call.
     */
    public privateLogs: ClaimedLengthArray<PrivateLogData, typeof MAX_PRIVATE_LOGS_PER_CALL>,
    /**
     * Hash of the contract class logs emitted in this function call.
     */
    public contractClassLogsHashes: ClaimedLengthArray<CountedLogHash, typeof MAX_CONTRACT_CLASS_LOGS_PER_CALL>,
    /**
     * The side effect counter at the start of this call.
     */
    public startSideEffectCounter: Fr,
    /**
     * The end side effect counter for this call.
     */
    public endSideEffectCounter: Fr,
    /**
     * Header of a block whose state is used during private execution (not the block the transaction is included in).
     */
    public historicalHeader: BlockHeader,
    /**
     * Transaction context.
     *
     * Note: The chainId and version in the txContext are not redundant to the values in self.historical_header.global_variables because
     * they can be different in case of a protocol upgrade. In such a situation we could be using header from a block
     * before the upgrade took place but be using the updated protocol to execute and prove the transaction.
     */
    public txContext: TxContext,
  ) {}

  /**
   * Create PrivateCircuitPublicInputs from a fields dictionary.
   * @param fields - The dictionary.
   * @returns A PrivateCircuitPublicInputs object.
   */
  static from(fields: FieldsOf<PrivateCircuitPublicInputs>): PrivateCircuitPublicInputs {
    return new PrivateCircuitPublicInputs(...PrivateCircuitPublicInputs.getFields(fields));
  }

  /**
   * Deserializes from a buffer or reader.
   * @param buffer - Buffer or reader to read from.
   * @returns The deserialized instance.
   */
  static fromBuffer(buffer: Buffer | BufferReader): PrivateCircuitPublicInputs {
    const reader = BufferReader.asReader(buffer);
    return new PrivateCircuitPublicInputs(
      reader.readObject(CallContext),
      reader.readObject(Fr),
      reader.readObject(Fr),
      reader.readObject(Fr),
      reader.readBoolean(),
      reader.readUInt64(),
      reader.readObject(ClaimedLengthArrayFromBuffer(ReadRequest, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL)),
      reader.readObject(ClaimedLengthArrayFromBuffer(ReadRequest, MAX_NULLIFIER_READ_REQUESTS_PER_CALL)),
      reader.readObject(
        ClaimedLengthArrayFromBuffer(KeyValidationRequestAndGenerator, MAX_KEY_VALIDATION_REQUESTS_PER_CALL),
      ),
      reader.readObject(ClaimedLengthArrayFromBuffer(NoteHash, MAX_NOTE_HASHES_PER_CALL)),
      reader.readObject(ClaimedLengthArrayFromBuffer(Nullifier, MAX_NULLIFIERS_PER_CALL)),
      reader.readObject(ClaimedLengthArrayFromBuffer(PrivateCallRequest, MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL)),
      reader.readObject(ClaimedLengthArrayFromBuffer(CountedPublicCallRequest, MAX_ENQUEUED_CALLS_PER_CALL)),
      reader.readObject(PublicCallRequest),
      reader.readObject(ClaimedLengthArrayFromBuffer(CountedL2ToL1Message, MAX_L2_TO_L1_MSGS_PER_CALL)),
      reader.readObject(ClaimedLengthArrayFromBuffer(PrivateLogData, MAX_PRIVATE_LOGS_PER_CALL)),
      reader.readObject(ClaimedLengthArrayFromBuffer(CountedLogHash, MAX_CONTRACT_CLASS_LOGS_PER_CALL)),
      reader.readObject(Fr),
      reader.readObject(Fr),
      reader.readObject(BlockHeader),
      reader.readObject(TxContext),
    );
  }

  static fromFields(fields: Fr[] | FieldReader): PrivateCircuitPublicInputs {
    const reader = FieldReader.asReader(fields);
    return new PrivateCircuitPublicInputs(
      reader.readObject(CallContext),
      reader.readField(),
      reader.readField(),
      reader.readField(),
      reader.readBoolean(),
      reader.readU64(),
      reader.readObject(ClaimedLengthArrayFromFields(ReadRequest, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL)),
      reader.readObject(ClaimedLengthArrayFromFields(ReadRequest, MAX_NULLIFIER_READ_REQUESTS_PER_CALL)),
      reader.readObject(
        ClaimedLengthArrayFromFields(KeyValidationRequestAndGenerator, MAX_KEY_VALIDATION_REQUESTS_PER_CALL),
      ),
      reader.readObject(ClaimedLengthArrayFromFields(NoteHash, MAX_NOTE_HASHES_PER_CALL)),
      reader.readObject(ClaimedLengthArrayFromFields(Nullifier, MAX_NULLIFIERS_PER_CALL)),
      reader.readObject(ClaimedLengthArrayFromFields(PrivateCallRequest, MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL)),
      reader.readObject(ClaimedLengthArrayFromFields(CountedPublicCallRequest, MAX_ENQUEUED_CALLS_PER_CALL)),
      reader.readObject(PublicCallRequest),
      reader.readObject(ClaimedLengthArrayFromFields(CountedL2ToL1Message, MAX_L2_TO_L1_MSGS_PER_CALL)),
      reader.readObject(ClaimedLengthArrayFromFields(PrivateLogData, MAX_PRIVATE_LOGS_PER_CALL)),
      reader.readObject(ClaimedLengthArrayFromFields(CountedLogHash, MAX_CONTRACT_CLASS_LOGS_PER_CALL)),
      reader.readField(),
      reader.readField(),
      reader.readObject(BlockHeader),
      reader.readObject(TxContext),
    );
  }

  /**
   * Create an empty PrivateCircuitPublicInputs.
   * @returns An empty PrivateCircuitPublicInputs object.
   */
  public static empty(): PrivateCircuitPublicInputs {
    return new PrivateCircuitPublicInputs(
      CallContext.empty(),
      Fr.ZERO,
      Fr.ZERO,
      Fr.ZERO,
      false,
      0n,
      ClaimedLengthArray.empty(ReadRequest, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL),
      ClaimedLengthArray.empty(ReadRequest, MAX_NULLIFIER_READ_REQUESTS_PER_CALL),
      ClaimedLengthArray.empty(KeyValidationRequestAndGenerator, MAX_KEY_VALIDATION_REQUESTS_PER_CALL),
      ClaimedLengthArray.empty(NoteHash, MAX_NOTE_HASHES_PER_CALL),
      ClaimedLengthArray.empty(Nullifier, MAX_NULLIFIERS_PER_CALL),
      ClaimedLengthArray.empty(PrivateCallRequest, MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL),
      ClaimedLengthArray.empty(CountedPublicCallRequest, MAX_ENQUEUED_CALLS_PER_CALL),
      PublicCallRequest.empty(),
      ClaimedLengthArray.empty(CountedL2ToL1Message, MAX_L2_TO_L1_MSGS_PER_CALL),
      ClaimedLengthArray.empty(PrivateLogData, MAX_PRIVATE_LOGS_PER_CALL),
      ClaimedLengthArray.empty(CountedLogHash, MAX_CONTRACT_CLASS_LOGS_PER_CALL),
      Fr.ZERO,
      Fr.ZERO,
      BlockHeader.empty(),
      TxContext.empty(),
    );
  }

  isEmpty() {
    return (
      this.callContext.isEmpty() &&
      this.argsHash.isZero() &&
      this.returnsHash.isZero() &&
      this.minRevertibleSideEffectCounter.isZero() &&
      !this.isFeePayer &&
      !this.includeByTimestamp &&
      this.noteHashReadRequests.isEmpty() &&
      this.nullifierReadRequests.isEmpty() &&
      this.keyValidationRequestsAndGenerators.isEmpty() &&
      this.noteHashes.isEmpty() &&
      this.nullifiers.isEmpty() &&
      this.privateCallRequests.isEmpty() &&
      this.publicCallRequests.isEmpty() &&
      this.publicTeardownCallRequest.isEmpty() &&
      this.l2ToL1Msgs.isEmpty() &&
      this.privateLogs.isEmpty() &&
      this.contractClassLogsHashes.isEmpty() &&
      this.startSideEffectCounter.isZero() &&
      this.endSideEffectCounter.isZero() &&
      this.historicalHeader.isEmpty() &&
      this.txContext.isEmpty()
    );
  }

  /**
   * Serialize into a field array. Low-level utility.
   * @param fields - Object with fields.
   * @returns The array.
   */
  static getFields(fields: FieldsOf<PrivateCircuitPublicInputs>) {
    return [
      fields.callContext,
      fields.argsHash,
      fields.returnsHash,
      fields.minRevertibleSideEffectCounter,
      fields.isFeePayer,
      fields.includeByTimestamp,
      fields.noteHashReadRequests,
      fields.nullifierReadRequests,
      fields.keyValidationRequestsAndGenerators,
      fields.noteHashes,
      fields.nullifiers,
      fields.privateCallRequests,
      fields.publicCallRequests,
      fields.publicTeardownCallRequest,
      fields.l2ToL1Msgs,
      fields.privateLogs,
      fields.contractClassLogsHashes,
      fields.startSideEffectCounter,
      fields.endSideEffectCounter,
      fields.historicalHeader,
      fields.txContext,
    ] as const;
  }

  /**
   * Serialize this as a buffer.
   * @returns The buffer.
   */
  toBuffer(): Buffer {
    return serializeToBuffer([
      this.callContext,
      this.argsHash,
      this.returnsHash,
      this.minRevertibleSideEffectCounter,
      this.isFeePayer,
      bigintToUInt64BE(this.includeByTimestamp),
      this.noteHashReadRequests,
      this.nullifierReadRequests,
      this.keyValidationRequestsAndGenerators,
      this.noteHashes,
      this.nullifiers,
      this.privateCallRequests,
      this.publicCallRequests,
      this.publicTeardownCallRequest,
      this.l2ToL1Msgs,
      this.privateLogs,
      this.contractClassLogsHashes,
      this.startSideEffectCounter,
      this.endSideEffectCounter,
      this.historicalHeader,
      this.txContext,
    ]);
  }

  /**
   * Serialize this as a field array.
   */
  toFields(): Fr[] {
    return serializeToFields(...PrivateCircuitPublicInputs.getFields(this));
  }

  public toJSON() {
    return this.toBuffer();
  }

  static get schema() {
    return bufferSchemaFor(PrivateCircuitPublicInputs);
  }
}
