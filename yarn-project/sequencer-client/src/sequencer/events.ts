import type { BlockNumber, CheckpointNumber, IndexWithinCheckpoint, SlotNumber } from '@aztec/foundation/branded-types';
import type { BlockHash } from '@aztec/stdlib/block';

import type { Action } from '../publisher/sequencer-publisher.js';
import type { SequencerState } from './utils.js';

export type SequencerEvents = {
  ['state-changed']: (args: {
    oldState: SequencerState;
    newState: SequencerState;
    secondsIntoSlot?: number;
    slot?: SlotNumber;
    timeReferenceSlot?: SlotNumber;
  }) => void;
  /**
   * Emitted by the sequencer once it has decided it is going to attempt to build a
   * checkpoint for `targetSlot`, after computing the L1 simulation overrides used by
   * `canProposeAt`. Fired BEFORE the L1 simulation is run, so consumers can observe the
   * decision regardless of whether the propose ultimately lands.
   *
   * - `hadProposedParent` indicates whether the build saw a proposed (pipelined) parent
   *   checkpoint that hasn't landed on L1 yet.
   * - `provenOverride` is the assumed proven checkpoint number pinned for the L1
   *   simulation. The plan always pins both chain tips to short-circuit `canPruneAtTime`,
   *   so this is populated whenever a simulation plan was built — the value either
   *   matches the on-chain proven snapshot (defensive pin) or the assumed-proven
   *   checkpoint when building optimistically across a pruning boundary.
   * - `simulatedPending` is the pending checkpoint passed to L1 simulation. The plan
   *   always pins both chain tips to short-circuit `canPruneAtTime`, so this reflects
   *   either the pipelined/invalidated tip or the on-chain pending snapshot.
   */
  ['preparing-checkpoint']: (args: {
    targetSlot: SlotNumber;
    checkpointNumber: CheckpointNumber;
    hadProposedParent: boolean;
    provenOverride: CheckpointNumber | undefined;
    simulatedPending: CheckpointNumber | undefined;
  }) => void;
  ['proposer-rollup-check-failed']: (args: { reason: string; slot: SlotNumber }) => void;
  ['block-tx-count-check-failed']: (args: { minTxs: number; availableTxs: number; slot: SlotNumber }) => void;
  ['block-build-failed']: (args: { reason: string; slot: SlotNumber }) => void;
  ['block-proposed']: (args: {
    blockNumber: BlockNumber;
    blockHash: BlockHash;
    checkpointNumber: CheckpointNumber;
    indexWithinCheckpoint: IndexWithinCheckpoint;
    slot: SlotNumber;
    buildSlot: SlotNumber;
  }) => void;
  ['checkpoint-empty']: (args: { slot: SlotNumber }) => void;
  /**
   * Emitted when the proposer's pre-broadcast `validateBlockHeader` simulation fails. This is a
   * last-chance check before we gossip a checkpoint proposal: a failure here means the header
   * would not be accepted by L1 (e.g. archive mismatch, stale chain tip, or some other state
   * drift between when we built the checkpoint and when we are about to broadcast it).
   */
  ['header-validation-failed']: (args: {
    slot: SlotNumber;
    checkpointNumber: CheckpointNumber;
    reason: string;
  }) => void;
  ['checkpoint-publish-failed']: (args: {
    slot: SlotNumber;
    successfulActions?: Action[];
    failedActions?: Action[];
    sentActions?: Action[];
    expiredActions?: Action[];
  }) => void;
  ['checkpoint-published']: (args: { checkpoint: CheckpointNumber; slot: SlotNumber }) => void;
  ['checkpoint-error']: (args: { error: Error }) => void;
  ['pipelined-checkpoint-discarded']: (args: {
    slot: SlotNumber;
    checkpointNumber: CheckpointNumber;
    reason: string;
  }) => void;
};
