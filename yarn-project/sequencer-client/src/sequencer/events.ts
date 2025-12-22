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
  ['proposer-rollup-check-failed']: (args: { reason: string; slot: SlotNumber }) => void;
  ['block-tx-count-check-failed']: (args: { minTxs: number; availableTxs: number; slot: SlotNumber }) => void;
  ['block-build-failed']: (args: { reason: string; slot: SlotNumber }) => void;
  ['block-proposed']: (args: { blockNumber: BlockNumber; slot: SlotNumber }) => void;
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
};
