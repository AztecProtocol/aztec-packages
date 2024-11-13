import { type FieldsOf, makeTuple } from '@aztec/foundation/array';
import { arraySerializedSizeOfNonEmpty } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, FieldReader, type Tuple, serializeToBuffer } from '@aztec/foundation/serialize';

import { inspect } from 'util';

import {
  MAX_ENCRYPTED_LOGS_PER_TX,
  MAX_ENQUEUED_CALLS_PER_TX,
  MAX_L2_TO_L1_MSGS_PER_TX,
  MAX_NOTE_ENCRYPTED_LOGS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_UNENCRYPTED_LOGS_PER_TX,
} from '../../constants.gen.js';
import { ScopedL2ToL1Message } from '../l2_to_l1_message.js';
import { LogHash, ScopedLogHash } from '../log_hash.js';
import { PublicCallRequest } from '../public_call_request.js';

export class PrivateToPublicAccumulatedData {
  constructor(
    public readonly noteHashes: Tuple<Fr, typeof MAX_NOTE_HASHES_PER_TX>,
    public readonly nullifiers: Tuple<Fr, typeof MAX_NULLIFIERS_PER_TX>,
    public readonly l2ToL1Msgs: Tuple<ScopedL2ToL1Message, typeof MAX_L2_TO_L1_MSGS_PER_TX>,
    public readonly noteEncryptedLogsHashes: Tuple<LogHash, typeof MAX_NOTE_ENCRYPTED_LOGS_PER_TX>,
    public readonly encryptedLogsHashes: Tuple<ScopedLogHash, typeof MAX_ENCRYPTED_LOGS_PER_TX>,
    public readonly unencryptedLogsHashes: Tuple<ScopedLogHash, typeof MAX_UNENCRYPTED_LOGS_PER_TX>,
    public readonly publicCallRequests: Tuple<PublicCallRequest, typeof MAX_ENQUEUED_CALLS_PER_TX>,
  ) {}

  getSize() {
    return (
      arraySerializedSizeOfNonEmpty(this.noteHashes) +
      arraySerializedSizeOfNonEmpty(this.nullifiers) +
      arraySerializedSizeOfNonEmpty(this.l2ToL1Msgs) +
      arraySerializedSizeOfNonEmpty(this.noteEncryptedLogsHashes) +
      arraySerializedSizeOfNonEmpty(this.encryptedLogsHashes) +
      arraySerializedSizeOfNonEmpty(this.unencryptedLogsHashes) +
      arraySerializedSizeOfNonEmpty(this.publicCallRequests)
    );
  }

  static getFields(fields: FieldsOf<PrivateToPublicAccumulatedData>) {
    return [
      fields.noteHashes,
      fields.nullifiers,
      fields.l2ToL1Msgs,
      fields.noteEncryptedLogsHashes,
      fields.encryptedLogsHashes,
      fields.unencryptedLogsHashes,
      fields.publicCallRequests,
    ] as const;
  }

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    return new this(
      reader.readFieldArray(MAX_NOTE_HASHES_PER_TX),
      reader.readFieldArray(MAX_NULLIFIERS_PER_TX),
      reader.readArray(MAX_L2_TO_L1_MSGS_PER_TX, ScopedL2ToL1Message),
      reader.readArray(MAX_NOTE_ENCRYPTED_LOGS_PER_TX, LogHash),
      reader.readArray(MAX_ENCRYPTED_LOGS_PER_TX, ScopedLogHash),
      reader.readArray(MAX_UNENCRYPTED_LOGS_PER_TX, ScopedLogHash),
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
      reader.readArray(MAX_NOTE_ENCRYPTED_LOGS_PER_TX, LogHash),
      reader.readArray(MAX_ENCRYPTED_LOGS_PER_TX, ScopedLogHash),
      reader.readArray(MAX_UNENCRYPTED_LOGS_PER_TX, ScopedLogHash),
      reader.readArray(MAX_ENQUEUED_CALLS_PER_TX, PublicCallRequest),
    );
  }

  toBuffer() {
    return serializeToBuffer(...PrivateToPublicAccumulatedData.getFields(this));
  }

  static empty() {
    return new PrivateToPublicAccumulatedData(
      makeTuple(MAX_NOTE_HASHES_PER_TX, Fr.zero),
      makeTuple(MAX_NULLIFIERS_PER_TX, Fr.zero),
      makeTuple(MAX_L2_TO_L1_MSGS_PER_TX, ScopedL2ToL1Message.empty),
      makeTuple(MAX_NOTE_ENCRYPTED_LOGS_PER_TX, LogHash.empty),
      makeTuple(MAX_ENCRYPTED_LOGS_PER_TX, ScopedLogHash.empty),
      makeTuple(MAX_UNENCRYPTED_LOGS_PER_TX, ScopedLogHash.empty),
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
      noteEncryptedLogsHashes: [${this.noteEncryptedLogsHashes
        .filter(x => !x.isEmpty())
        .map(h => inspect(h))
        .join(', ')}],
      encryptedLogsHashes: [${this.encryptedLogsHashes
        .filter(x => !x.isEmpty())
        .map(h => inspect(h))
        .join(', ')}],
      unencryptedLogsHashes: [${this.unencryptedLogsHashes
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
