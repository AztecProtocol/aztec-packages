import type { BlockNumber, CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';

import type { Action } from '../publisher/sequencer-publisher.js';
import type { SequencerState } from './utils.js';

export type SequencerEvents = {
  ['state-changed']: (args: {
    oldState: SequencerState;
    newState: SequencerState;
    secondsIntoSlot?: number;
    slot?: SlotNumber;
  }) => void;
  /**
   * Emitted by the sequencer once it has decided it is going to attempt to build a
   * checkpoint for `targetSlot`, after computing the L1 simulation overrides used by
   * `canProposeAt`. Fired BEFORE the L1 simulation is run, so consumers can observe the
   * decision regardless of whether the propose ultimately lands.
   *
   * - `hadProposedParent` indicates whether the build saw a proposed (pipelined) parent
   *   checkpoint that hasn't landed on L1 yet.
   * - `provenOverride` is the assumed proven checkpoint number when the proven-override
   *   for a pending prune was applied; `undefined` when no override was applied.
   * - `simulatedPending` is the pending checkpoint passed to L1 simulation (when
   *   pipelining or invalidating; undefined otherwise).
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
  ['block-proposed']: (args: { blockNumber: BlockNumber; slot: SlotNumber; buildSlot: SlotNumber }) => void;
  ['checkpoint-empty']: (args: { slot: SlotNumber }) => void;
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
