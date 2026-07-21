import { CheckpointNumber, type EpochNumber } from '@aztec/foundation/branded-types';
import type { Fr } from '@aztec/foundation/curves/bn254';
import type { Logger } from '@aztec/foundation/log';

import type { L2BlockSource } from '../block/l2_block_source.js';
import { type L1RollupConstants, getEpochAtSlot } from '../epoch-helpers/index.js';
import type { ProposedCheckpointData } from './checkpoint_data.js';

/**
 * Returns the out hashes (in epoch order) of all checkpoints in `epoch` that precede
 * `checkpointNumber`, used to compute the `epochOutHash` baked into that checkpoint's header.
 *
 * Under proposer pipelining the parent checkpoint may not be confirmed on L1 by the time the
 * builder runs, so the on-chain archiver query (`getCheckpointsData`) is missing it and the
 * resulting `epochOutHash` would diverge from what other validators (and L1) compute after the
 * parent lands. To avoid that, the parent's `checkpointOutHash` is spliced in from the locally
 * known proposed checkpoint when:
 *   - pipelining is enabled,
 *   - the archiver lookup is genuinely short (its last entry is not already cp `N-1`),
 *   - and the proposed cp `N-1` is in the same target epoch (otherwise we're at an epoch boundary
 *     and the previous-epoch cps must be excluded).
 *
 * Callers may either pass the already-loaded `proposedCheckpointData` (the proposer has it on
 * hand) or leave it undefined, in which case it's fetched via `getProposedCheckpointData`.
 */
export async function getPreviousCheckpointOutHashes(input: {
  blockSource: Pick<L2BlockSource, 'getCheckpointsData' | 'getProposedCheckpointData'>;
  epoch: EpochNumber;
  checkpointNumber: CheckpointNumber;
  l1Constants: Pick<L1RollupConstants, 'epochDuration'>;
  pipeliningEnabled: boolean;
  proposedCheckpointData?: ProposedCheckpointData;
  log?: Logger;
}): Promise<Fr[]> {
  const { blockSource, epoch, checkpointNumber, l1Constants, pipeliningEnabled, log } = input;

  const checkpointed = (await blockSource.getCheckpointsData({ epoch }))
    .filter(c => c.checkpointNumber < checkpointNumber)
    .sort((a, b) => a.checkpointNumber - b.checkpointNumber);

  if (!pipeliningEnabled || checkpointNumber === 0) {
    return checkpointed.map(c => c.checkpointOutHash);
  }

  const parentCheckpoint = CheckpointNumber(checkpointNumber - 1);
  if (checkpointed.at(-1)?.checkpointNumber === parentCheckpoint) {
    return checkpointed.map(c => c.checkpointOutHash);
  }

  const proposedParent =
    input.proposedCheckpointData ?? (await blockSource.getProposedCheckpointData({ number: parentCheckpoint }));
  if (!proposedParent || proposedParent.checkpointNumber !== parentCheckpoint) {
    return checkpointed.map(c => c.checkpointOutHash);
  }
  if (getEpochAtSlot(proposedParent.header.slotNumber, l1Constants) !== epoch) {
    return checkpointed.map(c => c.checkpointOutHash);
  }

  log?.debug(`Splicing pipelined parent cp ${parentCheckpoint} outHash for cp ${checkpointNumber}`);
  return [...checkpointed.map(c => c.checkpointOutHash), proposedParent.checkpointOutHash];
}
