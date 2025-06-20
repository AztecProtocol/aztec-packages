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
  PRIVATE_CIRCUIT_PUBLIC_INPUTS_LENGTH,
} from '@aztec/constants';
import { makeTuple } from '@aztec/foundation/array';
import { Fr } from '@aztec/foundation/fields';
import { bufferSchemaFor } from '@aztec/foundation/schemas';
import {
  BufferReader,
  FieldReader,
  type Tuple,
  serializeToBuffer,
  serializeToFields,
} from '@aztec/foundation/serialize';
import type { FieldsOf } from '@aztec/foundation/types';

import { KeyValidationRequestAndGenerator } from '../kernel/hints/key_validation_request_and_generator.js';
import { CountedLogHash } from '../kernel/log_hash.js';
import { PrivateCallRequest } from '../kernel/private_call_request.js';
import { PrivateLogData } from '../kernel/private_log_data.js';
import { L2ToL1Message } from '../messaging/l2_to_l1_message.js';
import { BlockHeader } from '../tx/block_header.js';
import { CallContext } from '../tx/call_context.js';
import { MaxBlockNumber } from '../tx/max_block_number.js';
import { TxContext } from '../tx/tx_context.js';
import { ReadRequest } from './hints/read_request.js';
import { NoteHash } from './note_hash.js';
import { Nullifier } from './nullifier.js';
import { CountedPublicCallRequest, PublicCallRequest } from './public_call_request.js';
import { isEmptyArray } from './utils/order_and_comparison.js';

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
     * The maximum block number in which this transaction can be included and be valid.
     */
    public maxBlockNumber: MaxBlockNumber,
    /**
     * Read requests created by the corresponding function call.
     */
    public noteHashReadRequests: Tuple<ReadRequest, typeof MAX_NOTE_HASH_READ_REQUESTS_PER_CALL>,
    /**
     * Nullifier read requests created by the corresponding function call.
     */
    public nullifierReadRequests: Tuple<ReadRequest, typeof MAX_NULLIFIER_READ_REQUESTS_PER_CALL>,
    /**
     * Key validation requests and generators created by the corresponding function call.
     */
    public keyValidationRequestsAndGenerators: Tuple<
      KeyValidationRequestAndGenerator,
      typeof MAX_KEY_VALIDATION_REQUESTS_PER_CALL
    >,
    /**
     * New note hashes created by the corresponding function call.
     */
    public noteHashes: Tuple<NoteHash, typeof MAX_NOTE_HASHES_PER_CALL>,
    /**
     * New nullifiers created by the corresponding function call.
     */
    public nullifiers: Tuple<Nullifier, typeof MAX_NULLIFIERS_PER_CALL>,
    /**
     * Private call requests made within the current kernel iteration.
     */
    public privateCallRequests: Tuple<PrivateCallRequest, typeof MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL>,
    /**
     * Public call stack at the current kernel iteration.
     */
    public publicCallRequests: Tuple<CountedPublicCallRequest, typeof MAX_ENQUEUED_CALLS_PER_CALL>,
    /**
     * Hash of the public teardown function.
     */
    public publicTeardownCallRequest: PublicCallRequest,
    /**
     * New L2 to L1 messages created by the corresponding function call.
     */
    public l2ToL1Msgs: Tuple<L2ToL1Message, typeof MAX_L2_TO_L1_MSGS_PER_CALL>,
    /**
     * Logs emitted in this function call.
     */
    public privateLogs: Tuple<PrivateLogData, typeof MAX_PRIVATE_LOGS_PER_CALL>,
    /**
     * Hash of the contract class logs emitted in this function call.
     */
    public contractClassLogsHashes: Tuple<CountedLogHash, typeof MAX_CONTRACT_CLASS_LOGS_PER_CALL>,
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
      reader.readObject(MaxBlockNumber),
      reader.readArray(MAX_NOTE_HASH_READ_REQUESTS_PER_CALL, ReadRequest),
      reader.readArray(MAX_NULLIFIER_READ_REQUESTS_PER_CALL, ReadRequest),
      reader.readArray(MAX_KEY_VALIDATION_REQUESTS_PER_CALL, KeyValidationRequestAndGenerator),
      reader.readArray(MAX_NOTE_HASHES_PER_CALL, NoteHash),
      reader.readArray(MAX_NULLIFIERS_PER_CALL, Nullifier),
      reader.readArray(MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL, PrivateCallRequest),
      reader.readArray(MAX_ENQUEUED_CALLS_PER_CALL, CountedPublicCallRequest),
      reader.readObject(PublicCallRequest),
      reader.readArray(MAX_L2_TO_L1_MSGS_PER_CALL, L2ToL1Message),
      reader.readArray(MAX_PRIVATE_LOGS_PER_CALL, PrivateLogData),
      reader.readArray(MAX_CONTRACT_CLASS_LOGS_PER_CALL, CountedLogHash),
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
      reader.readObject(MaxBlockNumber),
      reader.readArray(MAX_NOTE_HASH_READ_REQUESTS_PER_CALL, ReadRequest),
      reader.readArray(MAX_NULLIFIER_READ_REQUESTS_PER_CALL, ReadRequest),
      reader.readArray(MAX_KEY_VALIDATION_REQUESTS_PER_CALL, KeyValidationRequestAndGenerator),
      reader.readArray(MAX_NOTE_HASHES_PER_CALL, NoteHash),
      reader.readArray(MAX_NULLIFIERS_PER_CALL, Nullifier),
      reader.readArray(MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL, PrivateCallRequest),
      reader.readArray(MAX_ENQUEUED_CALLS_PER_CALL, CountedPublicCallRequest),
      reader.readObject(PublicCallRequest),
      reader.readArray(MAX_L2_TO_L1_MSGS_PER_CALL, L2ToL1Message),
      reader.readArray(MAX_PRIVATE_LOGS_PER_CALL, PrivateLogData),
      reader.readArray(MAX_CONTRACT_CLASS_LOGS_PER_CALL, CountedLogHash),
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
      MaxBlockNumber.empty(),
      makeTuple(MAX_NOTE_HASH_READ_REQUESTS_PER_CALL, ReadRequest.empty),
      makeTuple(MAX_NULLIFIER_READ_REQUESTS_PER_CALL, ReadRequest.empty),
      makeTuple(MAX_KEY_VALIDATION_REQUESTS_PER_CALL, KeyValidationRequestAndGenerator.empty),
      makeTuple(MAX_NOTE_HASHES_PER_CALL, NoteHash.empty),
      makeTuple(MAX_NULLIFIERS_PER_CALL, Nullifier.empty),
      makeTuple(MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL, PrivateCallRequest.empty),
      makeTuple(MAX_ENQUEUED_CALLS_PER_CALL, CountedPublicCallRequest.empty),
      PublicCallRequest.empty(),
      makeTuple(MAX_L2_TO_L1_MSGS_PER_CALL, L2ToL1Message.empty),
      makeTuple(MAX_PRIVATE_LOGS_PER_CALL, PrivateLogData.empty),
      makeTuple(MAX_CONTRACT_CLASS_LOGS_PER_CALL, CountedLogHash.empty),
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
      this.maxBlockNumber.isEmpty() &&
      isEmptyArray(this.noteHashReadRequests) &&
      isEmptyArray(this.nullifierReadRequests) &&
      isEmptyArray(this.keyValidationRequestsAndGenerators) &&
      isEmptyArray(this.noteHashes) &&
      isEmptyArray(this.nullifiers) &&
      isEmptyArray(this.privateCallRequests) &&
      isEmptyArray(this.publicCallRequests) &&
      this.publicTeardownCallRequest.isEmpty() &&
      isEmptyArray(this.l2ToL1Msgs) &&
      isEmptyArray(this.privateLogs) &&
      isEmptyArray(this.contractClassLogsHashes) &&
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
      fields.maxBlockNumber,
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
    return serializeToBuffer(...PrivateCircuitPublicInputs.getFields(this));
  }

  /**
   * Serialize this as a field array.
   */
  toFields(): Fr[] {
    const fields = serializeToFields(...PrivateCircuitPublicInputs.getFields(this));
    if (fields.length !== PRIVATE_CIRCUIT_PUBLIC_INPUTS_LENGTH) {
      throw new Error(
        `Invalid number of fields for PrivateCircuitPublicInputs. Expected ${PRIVATE_CIRCUIT_PUBLIC_INPUTS_LENGTH}, got ${fields.length}`,
      );
    }
    return fields;
  }

  public toJSON() {
    return this.toBuffer();
  }

  static get schema() {
    return bufferSchemaFor(PrivateCircuitPublicInputs);
  }
}
