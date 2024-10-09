import { makeTuple } from '@aztec/foundation/array';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, FieldReader, type Tuple, serializeToBuffer } from '@aztec/foundation/serialize';

import { inspect } from 'util';

import {
  MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX,
  MAX_L2_TO_L1_MSGS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX,
  MAX_NULLIFIER_READ_REQUESTS_PER_TX,
  MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX,
  MAX_PUBLIC_DATA_READS_PER_TX,
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  MAX_UNENCRYPTED_LOGS_PER_TX,
} from '../../constants.gen.js';
import { Gas } from '../gas.js';
import { GlobalVariables } from '../global_variables.js';
import { ScopedL2ToL1Message } from '../l2_to_l1_message.js';
import { ScopedLogHash } from '../log_hash.js';
import { ScopedNoteHash } from '../note_hash.js';
import { Nullifier } from '../nullifier.js';
import { PublicCallRequest } from '../public_call_request.js';
import { PublicDataRead } from '../public_data_read.js';
import { PublicDataUpdateRequest } from '../public_data_update_request.js';
import { PublicInnerCallRequest } from '../public_inner_call_request.js';
import { ScopedReadRequest } from '../read_request.js';
import { TreeLeafReadRequest } from '../tree_leaf_read_request.js';
import { PublicKernelAccumulatedArrayLengths } from './public_kernel_accumulated_array_lengths.js';

/**
 * Call stack item on a public call.
 */
export class VMCircuitPublicInputs {
  constructor(
    public globalVariables: GlobalVariables,
    public callRequest: PublicCallRequest,
    public publicCallStack: Tuple<PublicInnerCallRequest, typeof MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX>,
    public noteHashReadRequests: Tuple<TreeLeafReadRequest, typeof MAX_NOTE_HASH_READ_REQUESTS_PER_TX>,
    public nullifierReadRequests: Tuple<ScopedReadRequest, typeof MAX_NULLIFIER_READ_REQUESTS_PER_TX>,
    public nullifierNonExistentReadRequests: Tuple<
      ScopedReadRequest,
      typeof MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX
    >,
    public l1ToL2MsgReadRequests: Tuple<TreeLeafReadRequest, typeof MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX>,
    public publicDataReads: Tuple<PublicDataRead, typeof MAX_PUBLIC_DATA_READS_PER_TX>,
    public readonly noteHashes: Tuple<ScopedNoteHash, typeof MAX_NOTE_HASHES_PER_TX>,
    public readonly nullifiers: Tuple<Nullifier, typeof MAX_NULLIFIERS_PER_TX>,
    public readonly l2ToL1Msgs: Tuple<ScopedL2ToL1Message, typeof MAX_L2_TO_L1_MSGS_PER_TX>,
    public readonly unencryptedLogsHashes: Tuple<ScopedLogHash, typeof MAX_UNENCRYPTED_LOGS_PER_TX>,
    public readonly publicDataUpdateRequests: Tuple<
      PublicDataUpdateRequest,
      typeof MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX
    >,
    public prevArrayLengths: PublicKernelAccumulatedArrayLengths,
    public startSideEffectCounter: number,
    public endSideEffectCounter: number,
    public startGasLeft: Gas,
    public endGasLeft: Gas,
    public transactionFee: Fr,
    public reverted: boolean,
  ) {}

  toBuffer() {
    return serializeToBuffer(
      this.globalVariables,
      this.callRequest,
      this.publicCallStack,
      this.noteHashReadRequests,
      this.nullifierReadRequests,
      this.nullifierNonExistentReadRequests,
      this.l1ToL2MsgReadRequests,
      this.publicDataReads,
      this.noteHashes,
      this.nullifiers,
      this.l2ToL1Msgs,
      this.unencryptedLogsHashes,
      this.publicDataUpdateRequests,
      this.prevArrayLengths,
      this.startSideEffectCounter,
      this.endSideEffectCounter,
      this.startGasLeft,
      this.endGasLeft,
      this.transactionFee,
      this.reverted,
    );
  }

  clone() {
    return VMCircuitPublicInputs.fromBuffer(this.toBuffer());
  }

  toString() {
    return this.toBuffer().toString('hex');
  }

  static fromString(str: string) {
    return VMCircuitPublicInputs.fromBuffer(Buffer.from(str, 'hex'));
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new VMCircuitPublicInputs(
      reader.readObject(GlobalVariables),
      reader.readObject(PublicCallRequest),
      reader.readArray(MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX, PublicInnerCallRequest),
      reader.readArray(MAX_NOTE_HASH_READ_REQUESTS_PER_TX, TreeLeafReadRequest),
      reader.readArray(MAX_NULLIFIER_READ_REQUESTS_PER_TX, ScopedReadRequest),
      reader.readArray(MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX, ScopedReadRequest),
      reader.readArray(MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX, TreeLeafReadRequest),
      reader.readArray(MAX_PUBLIC_DATA_READS_PER_TX, PublicDataRead),
      reader.readArray(MAX_NOTE_HASHES_PER_TX, ScopedNoteHash),
      reader.readArray(MAX_NULLIFIERS_PER_TX, Nullifier),
      reader.readArray(MAX_L2_TO_L1_MSGS_PER_TX, ScopedL2ToL1Message),
      reader.readArray(MAX_UNENCRYPTED_LOGS_PER_TX, ScopedLogHash),
      reader.readArray(MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, PublicDataUpdateRequest),
      reader.readObject(PublicKernelAccumulatedArrayLengths),
      reader.readNumber(),
      reader.readNumber(),
      reader.readObject(Gas),
      reader.readObject(Gas),
      reader.readObject(Fr),
      reader.readBoolean(),
    );
  }

  static empty() {
    return new VMCircuitPublicInputs(
      GlobalVariables.empty(),
      PublicCallRequest.empty(),
      makeTuple(MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX, PublicInnerCallRequest.empty),
      makeTuple(MAX_NOTE_HASH_READ_REQUESTS_PER_TX, TreeLeafReadRequest.empty),
      makeTuple(MAX_NULLIFIER_READ_REQUESTS_PER_TX, ScopedReadRequest.empty),
      makeTuple(MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX, ScopedReadRequest.empty),
      makeTuple(MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX, TreeLeafReadRequest.empty),
      makeTuple(MAX_PUBLIC_DATA_READS_PER_TX, PublicDataRead.empty),
      makeTuple(MAX_NOTE_HASHES_PER_TX, ScopedNoteHash.empty),
      makeTuple(MAX_NULLIFIERS_PER_TX, Nullifier.empty),
      makeTuple(MAX_L2_TO_L1_MSGS_PER_TX, ScopedL2ToL1Message.empty),
      makeTuple(MAX_UNENCRYPTED_LOGS_PER_TX, ScopedLogHash.empty),
      makeTuple(MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, PublicDataUpdateRequest.empty),
      PublicKernelAccumulatedArrayLengths.empty(),
      0,
      0,
      Gas.empty(),
      Gas.empty(),
      Fr.ZERO,
      false,
    );
  }

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    return new VMCircuitPublicInputs(
      GlobalVariables.fromFields(reader),
      PublicCallRequest.fromFields(reader),
      reader.readArray(MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX, PublicInnerCallRequest),
      reader.readArray(MAX_NOTE_HASH_READ_REQUESTS_PER_TX, TreeLeafReadRequest),
      reader.readArray(MAX_NULLIFIER_READ_REQUESTS_PER_TX, ScopedReadRequest),
      reader.readArray(MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX, ScopedReadRequest),
      reader.readArray(MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX, TreeLeafReadRequest),
      reader.readArray(MAX_PUBLIC_DATA_READS_PER_TX, PublicDataRead),
      reader.readArray(MAX_NOTE_HASHES_PER_TX, ScopedNoteHash),
      reader.readArray(MAX_NULLIFIERS_PER_TX, Nullifier),
      reader.readArray(MAX_L2_TO_L1_MSGS_PER_TX, ScopedL2ToL1Message),
      reader.readArray(MAX_UNENCRYPTED_LOGS_PER_TX, ScopedLogHash),
      reader.readArray(MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, PublicDataUpdateRequest),
      PublicKernelAccumulatedArrayLengths.fromFields(reader),
      reader.readU32(),
      reader.readU32(),
      Gas.fromFields(reader),
      Gas.fromFields(reader),
      reader.readField(),
      reader.readBoolean(),
    );
  }

  [inspect.custom]() {
    return `VMCircuitPublicInputs {
      globalVariables: ${inspect(this.globalVariables)},
      callRequest: ${inspect(this.callRequest)}
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
      noteHashes: [${this.noteHashes
        .filter(x => !x.isEmpty())
        .map(h => inspect(h))
        .join(', ')}],
      nullifiers: [${this.nullifiers
        .filter(x => !x.isEmpty())
        .map(h => inspect(h))
        .join(', ')}],
      l2ToL1Msgs: [${this.l2ToL1Msgs
        .filter(x => !x.isEmpty())
        .map(h => inspect(h))
        .join(', ')}],
      unencryptedLogsHashes: [${this.unencryptedLogsHashes
        .filter(x => !x.isEmpty())
        .map(h => inspect(h))
        .join(', ')}],
      publicDataUpdateRequests: [${this.publicDataUpdateRequests
        .filter(x => !x.isEmpty())
        .map(h => inspect(h))
        .join(', ')}],
      prevArrayLengths: ${this.prevArrayLengths},
      startSideEffectCounter: ${this.startSideEffectCounter},
      endSideEffectCounter: ${this.endSideEffectCounter},
      startGasLeft: ${this.startGasLeft},
      endGasLeft: ${this.endGasLeft},
      transactionFee: ${this.transactionFee},
      reverted: ${this.reverted},
      }`;
  }
}
