import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';

import {
  MAX_CONTRACT_CLASS_LOGS_PER_TX,
  MAX_ENQUEUED_CALLS_PER_TX,
  MAX_L2_TO_L1_MSGS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_PRIVATE_LOGS_PER_TX,
} from '../../constants.gen.js';
import { ScopedL2ToL1Message } from '../l2_to_l1_message.js';
import { ScopedLogHash } from '../log_hash.js';
import { PrivateLog } from '../private_log.js';
import { PublicCallRequest } from '../public_call_request.js';
import { PrivateToPublicAccumulatedData } from './private_to_public_accumulated_data.js';

/**
 * TESTS-ONLY CLASS
 * Builder for PrivateToPublicAccumulatedData, used to conveniently construct instances for testing,
 * as PrivateToPublicAccumulatedData is (or will shortly be) immutable.
 *
 */
export class PrivateToPublicAccumulatedDataBuilder {
  private noteHashes: Fr[] = [];
  private nullifiers: Fr[] = [];
  private l2ToL1Msgs: ScopedL2ToL1Message[] = [];
  private privateLogs: PrivateLog[] = [];
  private contractClassLogsHashes: ScopedLogHash[] = [];
  private publicCallRequests: PublicCallRequest[] = [];

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

  pushPrivateLog(privateLog: PrivateLog) {
    this.privateLogs.push(privateLog);
    return this;
  }

  withPrivateLogs(privateLogs: PrivateLog[]) {
    this.privateLogs = privateLogs;
    return this;
  }

  pushContractClassLogsHash(contractClassLogsHash: ScopedLogHash) {
    this.contractClassLogsHashes.push(contractClassLogsHash);
    return this;
  }

  withContractClassLogsHashes(contractClassLogsHashes: ScopedLogHash[]) {
    this.contractClassLogsHashes = contractClassLogsHashes;
    return this;
  }

  pushPublicCall(publicCall: PublicCallRequest) {
    this.publicCallRequests.push(publicCall);
    return this;
  }

  withPublicCallRequests(publicCallRequests: PublicCallRequest[]) {
    this.publicCallRequests = publicCallRequests;
    return this;
  }

  build() {
    return new PrivateToPublicAccumulatedData(
      padArrayEnd(this.noteHashes, Fr.ZERO, MAX_NOTE_HASHES_PER_TX),
      padArrayEnd(this.nullifiers, Fr.ZERO, MAX_NULLIFIERS_PER_TX),
      padArrayEnd(this.l2ToL1Msgs, ScopedL2ToL1Message.empty(), MAX_L2_TO_L1_MSGS_PER_TX),
      padArrayEnd(this.privateLogs, PrivateLog.empty(), MAX_PRIVATE_LOGS_PER_TX),
      padArrayEnd(this.contractClassLogsHashes, ScopedLogHash.empty(), MAX_CONTRACT_CLASS_LOGS_PER_TX),
      padArrayEnd(this.publicCallRequests, PublicCallRequest.empty(), MAX_ENQUEUED_CALLS_PER_TX),
    );
  }
}
