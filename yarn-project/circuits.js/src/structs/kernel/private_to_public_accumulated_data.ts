import { type FieldsOf, makeTuple } from '@aztec/foundation/array';
import { arraySerializedSizeOfNonEmpty } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import {
  BufferReader,
  FieldReader,
  type Tuple,
  serializeToBuffer,
  serializeToFields,
} from '@aztec/foundation/serialize';

import { inspect } from 'util';

import {
  MAX_CONTRACT_CLASS_LOGS_PER_TX,
  MAX_ENQUEUED_CALLS_PER_TX,
  MAX_L2_TO_L1_MSGS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_PRIVATE_LOGS_PER_TX,
  PRIVATE_TO_PUBLIC_ACCUMULATED_DATA_LENGTH,
} from '../../constants.gen.js';
import { ScopedL2ToL1Message } from '../l2_to_l1_message.js';
import { ScopedLogHash } from '../log_hash.js';
import { PrivateLog } from '../private_log.js';
import { PublicCallRequest } from '../public_call_request.js';

export class PrivateToPublicAccumulatedData {
  constructor(
    public readonly noteHashes: Tuple<Fr, typeof MAX_NOTE_HASHES_PER_TX>,
    public readonly nullifiers: Tuple<Fr, typeof MAX_NULLIFIERS_PER_TX>,
    public readonly l2ToL1Msgs: Tuple<ScopedL2ToL1Message, typeof MAX_L2_TO_L1_MSGS_PER_TX>,
    public readonly privateLogs: Tuple<PrivateLog, typeof MAX_PRIVATE_LOGS_PER_TX>,
    public readonly contractClassLogsHashes: Tuple<ScopedLogHash, typeof MAX_CONTRACT_CLASS_LOGS_PER_TX>,
    public readonly publicCallRequests: Tuple<PublicCallRequest, typeof MAX_ENQUEUED_CALLS_PER_TX>,
  ) {}

  getSize() {
    return (
      arraySerializedSizeOfNonEmpty(this.noteHashes) +
      arraySerializedSizeOfNonEmpty(this.nullifiers) +
      arraySerializedSizeOfNonEmpty(this.l2ToL1Msgs) +
      arraySerializedSizeOfNonEmpty(this.privateLogs) +
      arraySerializedSizeOfNonEmpty(this.contractClassLogsHashes) +
      arraySerializedSizeOfNonEmpty(this.publicCallRequests)
    );
  }

  static getFields(fields: FieldsOf<PrivateToPublicAccumulatedData>) {
    return [
      fields.noteHashes,
      fields.nullifiers,
      fields.l2ToL1Msgs,
      fields.privateLogs,
      fields.contractClassLogsHashes,
      fields.publicCallRequests,
    ] as const;
  }

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    return new this(
      reader.readFieldArray(MAX_NOTE_HASHES_PER_TX),
      reader.readFieldArray(MAX_NULLIFIERS_PER_TX),
      reader.readArray(MAX_L2_TO_L1_MSGS_PER_TX, ScopedL2ToL1Message),
      reader.readArray(MAX_PRIVATE_LOGS_PER_TX, PrivateLog),
      reader.readArray(MAX_CONTRACT_CLASS_LOGS_PER_TX, ScopedLogHash),
      reader.readArray(MAX_ENQUEUED_CALLS_PER_TX, PublicCallRequest),
    );
  }

  static from(fields: FieldsOf<PrivateToPublicAccumulatedData>) {
    return new PrivateToPublicAccumulatedData(...PrivateToPublicAccumulatedData.getFields(fields));
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new PrivateToPublicAccumulatedData(
      reader.readArray(MAX_NOTE_HASHES_PER_TX, Fr),
      reader.readArray(MAX_NULLIFIERS_PER_TX, Fr),
      reader.readArray(MAX_L2_TO_L1_MSGS_PER_TX, ScopedL2ToL1Message),
      reader.readArray(MAX_PRIVATE_LOGS_PER_TX, PrivateLog),
      reader.readArray(MAX_CONTRACT_CLASS_LOGS_PER_TX, ScopedLogHash),
      reader.readArray(MAX_ENQUEUED_CALLS_PER_TX, PublicCallRequest),
    );
  }

  toBuffer() {
    return serializeToBuffer(...PrivateToPublicAccumulatedData.getFields(this));
  }

  toFields(): Fr[] {
    const fields = serializeToFields(...PrivateToPublicAccumulatedData.getFields(this));
    if (fields.length !== PRIVATE_TO_PUBLIC_ACCUMULATED_DATA_LENGTH) {
      throw new Error(
        `Invalid number of fields for PrivateToPublicAccumulatedData. Expected ${PRIVATE_TO_PUBLIC_ACCUMULATED_DATA_LENGTH}, got ${fields.length}`,
      );
    }
    return fields;
  }

  static empty() {
    return new PrivateToPublicAccumulatedData(
      makeTuple(MAX_NOTE_HASHES_PER_TX, Fr.zero),
      makeTuple(MAX_NULLIFIERS_PER_TX, Fr.zero),
      makeTuple(MAX_L2_TO_L1_MSGS_PER_TX, ScopedL2ToL1Message.empty),
      makeTuple(MAX_PRIVATE_LOGS_PER_TX, PrivateLog.empty),
      makeTuple(MAX_CONTRACT_CLASS_LOGS_PER_TX, ScopedLogHash.empty),
      makeTuple(MAX_ENQUEUED_CALLS_PER_TX, PublicCallRequest.empty),
    );
  }

  [inspect.custom]() {
    return `PrivateToPublicAccumulatedData {
      noteHashes: [${this.noteHashes
        .filter(x => !x.isZero())
        .map(x => inspect(x))
        .join(', ')}],
      nullifiers: [${this.nullifiers
        .filter(x => !x.isZero())
        .map(x => inspect(x))
        .join(', ')}],
      l2ToL1Msgs: [${this.l2ToL1Msgs
        .filter(x => !x.isEmpty())
        .map(x => inspect(x))
        .join(', ')}],
      privateLogs: [${this.privateLogs
        .filter(x => !x.isEmpty())
        .map(h => inspect(h))
        .join(', ')}],
      contractClassLogsHashes: [${this.contractClassLogsHashes
        .filter(x => !x.isEmpty())
        .map(h => inspect(h))
        .join(', ')}],
      publicCallRequests: [${this.publicCallRequests
        .filter(x => !x.isEmpty())
        .map(h => inspect(h))
        .join(', ')}],
    }`;
  }
}
