import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';

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
import { PrivateToPublicAccumulatedData } from './private_to_public_accumulated_data.js';

/**
 * TESTS-ONLY CLASS
 * Builder for PublicAccumulatedData, used to conveniently construct instances for testing,
 * as PublicAccumulatedData is (or will shortly be) immutable.
 *
 */
export class PrivateToPublicAccumulatedDataBuilder {
  private noteHashes: Fr[] = [];
  private nullifiers: Fr[] = [];
  private l2ToL1Msgs: ScopedL2ToL1Message[] = [];
  private noteEncryptedLogsHashes: LogHash[] = [];
  private encryptedLogsHashes: ScopedLogHash[] = [];
  private unencryptedLogsHashes: ScopedLogHash[] = [];
  private publicCallStack: PublicCallRequest[] = [];

  pushNoteHash(newNoteHash: Fr) {
    this.noteHashes.push(newNoteHash);
    return this;
  }

  withNoteHashes(noteHashes: Fr[]) {
    this.noteHashes = noteHashes;
    return this;
  }

  pushNullifier(newNullifier: Fr) {
    this.nullifiers.push(newNullifier);
    return this;
  }

  withNullifiers(nullifiers: Fr[]) {
    this.nullifiers = nullifiers;
    return this;
  }

  pushL2ToL1Msg(newL2ToL1Msg: ScopedL2ToL1Message) {
    this.l2ToL1Msgs.push(newL2ToL1Msg);
    return this;
  }

  withL2ToL1Msgs(l2ToL1Msgs: ScopedL2ToL1Message[]) {
    this.l2ToL1Msgs = l2ToL1Msgs;
    return this;
  }

  pushNoteEncryptedLogsHash(noteEncryptedLogsHash: LogHash) {
    this.noteEncryptedLogsHashes.push(noteEncryptedLogsHash);
    return this;
  }

  withNoteEncryptedLogsHashes(noteEncryptedLogsHashes: LogHash[]) {
    this.noteEncryptedLogsHashes = noteEncryptedLogsHashes;
    return this;
  }

  pushEncryptedLogsHash(encryptedLogsHash: ScopedLogHash) {
    this.encryptedLogsHashes.push(encryptedLogsHash);
    return this;
  }

  withEncryptedLogsHashes(encryptedLogsHashes: ScopedLogHash[]) {
    this.encryptedLogsHashes = encryptedLogsHashes;
    return this;
  }

  pushUnencryptedLogsHash(unencryptedLogsHash: ScopedLogHash) {
    this.unencryptedLogsHashes.push(unencryptedLogsHash);
    return this;
  }

  withUnencryptedLogsHashes(unencryptedLogsHashes: ScopedLogHash[]) {
    this.unencryptedLogsHashes = unencryptedLogsHashes;
    return this;
  }

  pushPublicCall(publicCall: PublicCallRequest) {
    this.publicCallStack.push(publicCall);
    return this;
  }

  withPublicCallStack(publicCallStack: PublicCallRequest[]) {
    this.publicCallStack = publicCallStack;
    return this;
  }

  build() {
    return new PrivateToPublicAccumulatedData(
      padArrayEnd(this.noteHashes, Fr.ZERO, MAX_NOTE_HASHES_PER_TX),
      padArrayEnd(this.nullifiers, Fr.ZERO, MAX_NULLIFIERS_PER_TX),
      padArrayEnd(this.l2ToL1Msgs, ScopedL2ToL1Message.empty(), MAX_L2_TO_L1_MSGS_PER_TX),
      padArrayEnd(this.noteEncryptedLogsHashes, LogHash.empty(), MAX_NOTE_ENCRYPTED_LOGS_PER_TX),
      padArrayEnd(this.encryptedLogsHashes, ScopedLogHash.empty(), MAX_ENCRYPTED_LOGS_PER_TX),
      padArrayEnd(this.unencryptedLogsHashes, ScopedLogHash.empty(), MAX_UNENCRYPTED_LOGS_PER_TX),
      padArrayEnd(this.publicCallStack, PublicCallRequest.empty(), MAX_ENQUEUED_CALLS_PER_TX),
    );
  }

  static fromPublicAccumulatedData(publicAccumulatedData: PrivateToPublicAccumulatedData) {
    return new PrivateToPublicAccumulatedDataBuilder()
      .withNoteHashes(publicAccumulatedData.noteHashes)
      .withNullifiers(publicAccumulatedData.nullifiers)
      .withL2ToL1Msgs(publicAccumulatedData.l2ToL1Msgs)
      .withNoteEncryptedLogsHashes(publicAccumulatedData.noteEncryptedLogsHashes)
      .withEncryptedLogsHashes(publicAccumulatedData.encryptedLogsHashes)
      .withUnencryptedLogsHashes(publicAccumulatedData.unencryptedLogsHashes)
      .withPublicCallStack(publicAccumulatedData.publicCallRequests);
  }
}
