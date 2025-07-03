import {
  MAX_CONTRACT_CLASS_LOGS_PER_TX,
  MAX_ENQUEUED_CALLS_PER_TX,
  MAX_L2_TO_L1_MSGS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX,
  MAX_PRIVATE_LOGS_PER_TX,
} from '@aztec/constants';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';

import { ScopedCountedL2ToL1Message } from '../messaging/l2_to_l1_message.js';
import { ClaimedLengthArray, ClaimedLengthArrayFromBuffer } from './claimed_length_array.js';
import { ScopedCountedLogHash } from './log_hash.js';
import { ScopedNoteHash } from './note_hash.js';
import { ScopedNullifier } from './nullifier.js';
import { PrivateCallRequest } from './private_call_request.js';
import { ScopedPrivateLogData } from './private_log_data.js';
import { CountedPublicCallRequest } from './public_call_request.js';

/**
 * Specific accumulated data structure for the final ordering private kernel circuit. It is included
 *  in the final public inputs of private kernel circuit.
 */
export class PrivateAccumulatedData {
  constructor(
    /**
     * The new note hashes made in this transaction.
     */
    public noteHashes: ClaimedLengthArray<ScopedNoteHash, typeof MAX_NOTE_HASHES_PER_TX>,
    /**
     * The new nullifiers made in this transaction.
     */
    public nullifiers: ClaimedLengthArray<ScopedNullifier, typeof MAX_NULLIFIERS_PER_TX>,
    /**
     * All the new L2 to L1 messages created in this transaction.
     */
    public l2ToL1Msgs: ClaimedLengthArray<ScopedCountedL2ToL1Message, typeof MAX_L2_TO_L1_MSGS_PER_TX>,
    /**
     * Accumulated logs from all the previous kernel iterations.
     */
    public privateLogs: ClaimedLengthArray<ScopedPrivateLogData, typeof MAX_PRIVATE_LOGS_PER_TX>,
    /**
     * Accumulated contract class logs from all the previous kernel iterations.
     * Note: Truncated to 31 bytes to fit in Fr.
     */
    public contractClassLogsHashes: ClaimedLengthArray<ScopedCountedLogHash, typeof MAX_CONTRACT_CLASS_LOGS_PER_TX>,
    /**
     * Accumulated public call requests from all the previous kernel iterations.
     */
    public publicCallRequests: ClaimedLengthArray<CountedPublicCallRequest, typeof MAX_ENQUEUED_CALLS_PER_TX>,
    /**
     * Current private call stack.
     */
    public privateCallStack: ClaimedLengthArray<PrivateCallRequest, typeof MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX>,
  ) {}

  toBuffer() {
    return serializeToBuffer(
      this.noteHashes,
      this.nullifiers,
      this.l2ToL1Msgs,
      this.privateLogs,
      this.contractClassLogsHashes,
      this.publicCallRequests,
      this.privateCallStack,
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
  static fromBuffer(buffer: Buffer | BufferReader): PrivateAccumulatedData {
    const reader = BufferReader.asReader(buffer);
    return new PrivateAccumulatedData(
      reader.readObject(ClaimedLengthArrayFromBuffer(ScopedNoteHash, MAX_NOTE_HASHES_PER_TX)),
      reader.readObject(ClaimedLengthArrayFromBuffer(ScopedNullifier, MAX_NULLIFIERS_PER_TX)),
      reader.readObject(ClaimedLengthArrayFromBuffer(ScopedCountedL2ToL1Message, MAX_L2_TO_L1_MSGS_PER_TX)),
      reader.readObject(ClaimedLengthArrayFromBuffer(ScopedPrivateLogData, MAX_PRIVATE_LOGS_PER_TX)),
      reader.readObject(ClaimedLengthArrayFromBuffer(ScopedCountedLogHash, MAX_CONTRACT_CLASS_LOGS_PER_TX)),
      reader.readObject(ClaimedLengthArrayFromBuffer(CountedPublicCallRequest, MAX_ENQUEUED_CALLS_PER_TX)),
      reader.readObject(ClaimedLengthArrayFromBuffer(PrivateCallRequest, MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX)),
    );
  }

  /**
   * Deserializes from a string, corresponding to a write in cpp.
   * @param str - String to read from.
   * @returns Deserialized object.
   */
  static fromString(str: string) {
    return PrivateAccumulatedData.fromBuffer(hexToBuffer(str));
  }

  static empty() {
    return new PrivateAccumulatedData(
      ClaimedLengthArray.empty(ScopedNoteHash, MAX_NOTE_HASHES_PER_TX),
      ClaimedLengthArray.empty(ScopedNullifier, MAX_NULLIFIERS_PER_TX),
      ClaimedLengthArray.empty(ScopedCountedL2ToL1Message, MAX_L2_TO_L1_MSGS_PER_TX),
      ClaimedLengthArray.empty(ScopedPrivateLogData, MAX_PRIVATE_LOGS_PER_TX),
      ClaimedLengthArray.empty(ScopedCountedLogHash, MAX_CONTRACT_CLASS_LOGS_PER_TX),
      ClaimedLengthArray.empty(CountedPublicCallRequest, MAX_ENQUEUED_CALLS_PER_TX),
      ClaimedLengthArray.empty(PrivateCallRequest, MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX),
    );
  }
}
