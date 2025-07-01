import { MAX_NOTE_HASH_READ_REQUESTS_PER_TX, NOTE_HASH_TREE_HEIGHT } from '@aztec/constants';
import { makeTuple } from '@aztec/foundation/array';
import { Fr } from '@aztec/foundation/fields';
import type { BufferReader } from '@aztec/foundation/serialize';
import type { MembershipWitness } from '@aztec/foundation/trees';

import {
  PendingReadHint,
  ReadRequestResetHints,
  ReadRequestState,
  ReadRequestStatus,
  SettledReadHint,
} from './read_request_hints.js';

type NoteHashLeafValue = Fr;

export type NoteHashReadRequestHints<PENDING extends number, SETTLED extends number> = ReadRequestResetHints<
  typeof MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
  PENDING,
  SETTLED,
  typeof NOTE_HASH_TREE_HEIGHT,
  NoteHashLeafValue
>;

export function noteHashReadRequestHintsFromBuffer<PENDING extends number, SETTLED extends number>(
  buffer: Buffer | BufferReader,
  numPending: PENDING,
  numSettled: SETTLED,
): NoteHashReadRequestHints<PENDING, SETTLED> {
  return ReadRequestResetHints.fromBuffer(
    buffer,
    MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
    numPending,
    numSettled,
    NOTE_HASH_TREE_HEIGHT,
    Fr,
  );
}

export class NoteHashReadRequestHintsBuilder<PENDING extends number, SETTLED extends number> {
  private hints: NoteHashReadRequestHints<PENDING, SETTLED>;
  public numPendingReadHints = 0;
  public numSettledReadHints = 0;

  constructor(
    public readonly maxPending: PENDING,
    public readonly maxSettled: SETTLED,
  ) {
    this.hints = new ReadRequestResetHints(
      makeTuple(MAX_NOTE_HASH_READ_REQUESTS_PER_TX, ReadRequestStatus.nada),
      makeTuple(maxPending, () => PendingReadHint.nada(MAX_NOTE_HASH_READ_REQUESTS_PER_TX)),
      makeTuple(maxSettled, () =>
        SettledReadHint.nada(MAX_NOTE_HASH_READ_REQUESTS_PER_TX, NOTE_HASH_TREE_HEIGHT, Fr.zero),
      ),
    );
  }

  static empty<PENDING extends number, SETTLED extends number>(maxPending: PENDING, maxSettled: SETTLED) {
    return new NoteHashReadRequestHintsBuilder(maxPending, maxSettled).toHints();
  }

  addPendingReadRequest(readRequestIndex: number, noteHashIndex: number) {
    if (this.numPendingReadHints === this.maxPending) {
      throw new Error('Cannot add more pending read request.');
    }
    this.hints.readRequestStatuses[readRequestIndex] = new ReadRequestStatus(
      ReadRequestState.PENDING,
      this.numPendingReadHints,
    );
    this.hints.pendingReadHints[this.numPendingReadHints] = new PendingReadHint(readRequestIndex, noteHashIndex);
    this.numPendingReadHints++;
  }

  addSettledReadRequest(
    readRequestIndex: number,
    membershipWitness: MembershipWitness<typeof NOTE_HASH_TREE_HEIGHT>,
    value: NoteHashLeafValue,
  ) {
    if (this.numSettledReadHints === this.maxSettled) {
      throw new Error('Cannot add more settled read request.');
    }
    this.hints.readRequestStatuses[readRequestIndex] = new ReadRequestStatus(
      ReadRequestState.SETTLED,
      this.numSettledReadHints,
    );
    this.hints.settledReadHints[this.numSettledReadHints] = new SettledReadHint(
      readRequestIndex,
      membershipWitness,
      value,
    );
    this.numSettledReadHints++;
  }

  toHints() {
    return this.hints;
  }
}
