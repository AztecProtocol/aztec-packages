import { MAX_NULLIFIER_READ_REQUESTS_PER_TX, NULLIFIER_TREE_HEIGHT } from '@aztec/constants';
import { makeTuple } from '@aztec/foundation/array';
import type { BufferReader } from '@aztec/foundation/serialize';
import type { MembershipWitness, TreeLeafPreimage } from '@aztec/foundation/trees';

import { NullifierLeafPreimage } from '../../trees/index.js';
import {
  PendingReadHint,
  ReadRequestAction,
  ReadRequestActionsEnum,
  ReadRequestResetHints,
  SettledReadHint,
} from './read_request_hints.js';

export type NullifierReadRequestHints<PENDING extends number, SETTLED extends number> = ReadRequestResetHints<
  typeof MAX_NULLIFIER_READ_REQUESTS_PER_TX,
  PENDING,
  SETTLED,
  typeof NULLIFIER_TREE_HEIGHT,
  TreeLeafPreimage
>;

export function nullifierReadRequestHintsFromBuffer<PENDING extends number, SETTLED extends number>(
  buffer: Buffer | BufferReader,
  numPendingReads: PENDING,
  numSettledReads: SETTLED,
): NullifierReadRequestHints<PENDING, SETTLED> {
  return ReadRequestResetHints.fromBuffer(
    buffer,
    MAX_NULLIFIER_READ_REQUESTS_PER_TX,
    numPendingReads,
    numSettledReads,
    NULLIFIER_TREE_HEIGHT,
    NullifierLeafPreimage,
  );
}

export class NullifierReadRequestHintsBuilder<PENDING extends number, SETTLED extends number> {
  private hints: NullifierReadRequestHints<PENDING, SETTLED>;
  private numPendingReadHints = 0;
  private numSettledReadHints = 0;

  constructor(
    public readonly maxPending: PENDING,
    public readonly maxSettled: SETTLED,
  ) {
    this.hints = new ReadRequestResetHints(
      makeTuple(MAX_NULLIFIER_READ_REQUESTS_PER_TX, ReadRequestAction.skip),
      makeTuple(maxPending, () => PendingReadHint.skip(MAX_NULLIFIER_READ_REQUESTS_PER_TX)),
      makeTuple(maxSettled, () =>
        SettledReadHint.skip(MAX_NULLIFIER_READ_REQUESTS_PER_TX, NULLIFIER_TREE_HEIGHT, NullifierLeafPreimage.empty),
      ),
    );
  }

  static empty<PENDING extends number, SETTLED extends number>(maxPending: PENDING, maxSettled: SETTLED) {
    return new NullifierReadRequestHintsBuilder(maxPending, maxSettled).toHints();
  }

  addPendingReadRequest(readRequestIndex: number, nullifierIndex: number) {
    if (this.numPendingReadHints === this.maxPending) {
      throw new Error('Cannot add more pending read request.');
    }

    this.hints.readRequestActions[readRequestIndex] = new ReadRequestAction(
      ReadRequestActionsEnum.READ_AS_PENDING,
      this.numPendingReadHints,
    );
    this.hints.pendingReadHints[this.numPendingReadHints] = new PendingReadHint(readRequestIndex, nullifierIndex);
    this.numPendingReadHints++;
  }

  addSettledReadRequest(
    readRequestIndex: number,
    membershipWitness: MembershipWitness<typeof NULLIFIER_TREE_HEIGHT>,
    leafPreimage: TreeLeafPreimage,
  ) {
    if (this.numSettledReadHints === this.maxSettled) {
      throw new Error('Cannot add more settled read request.');
    }
    this.hints.readRequestActions[readRequestIndex] = new ReadRequestAction(
      ReadRequestActionsEnum.READ_AS_SETTLED,
      this.numSettledReadHints,
    );
    this.hints.settledReadHints[this.numSettledReadHints] = new SettledReadHint(
      readRequestIndex,
      membershipWitness,
      leafPreimage,
    );
    this.numSettledReadHints++;
  }

  toHints() {
    return this.hints;
  }
}
