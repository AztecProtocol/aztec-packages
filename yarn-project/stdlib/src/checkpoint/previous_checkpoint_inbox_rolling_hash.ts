import { CheckpointNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { Logger } from '@aztec/foundation/log';

import type { L2BlockSource } from '../block/l2_block_source.js';
import type { ProposedCheckpointData } from './checkpoint_data.js';

/**
 * Returns the inbox rolling hash chain-start for `checkpointNumber`: the `inboxRollingHash` of the immediately
 * preceding checkpoint. Unlike the epoch out-hash tree, the rolling-hash chain is continuous across epoch boundaries,
 * so the parent is always `checkpointNumber - 1` regardless of epoch. The genesis checkpoint (and the first checkpoint
 * built on it) starts the chain at zero.
 *
 * Under proposer pipelining the parent may not be confirmed on L1 yet, so the locally-known proposed checkpoint is
 * preferred when it is the parent, mirroring `getPreviousCheckpointOutHashes`.
 */
export async function getPreviousCheckpointInboxRollingHash(input: {
  blockSource: Pick<L2BlockSource, 'getCheckpointData' | 'getProposedCheckpointData'>;
  checkpointNumber: CheckpointNumber;
  proposedCheckpointData?: ProposedCheckpointData;
  log?: Logger;
}): Promise<Fr> {
  const { blockSource, checkpointNumber, proposedCheckpointData, log } = input;
  if (checkpointNumber <= 1) {
    return Fr.ZERO;
  }

  const parent = CheckpointNumber(checkpointNumber - 1);

  if (proposedCheckpointData?.checkpointNumber === parent) {
    log?.debug(`Using pipelined parent cp ${parent} inbox rolling hash for cp ${checkpointNumber}`);
    return proposedCheckpointData.header.inboxRollingHash;
  }

  const confirmed = await blockSource.getCheckpointData({ number: parent });
  if (confirmed) {
    return confirmed.header.inboxRollingHash;
  }

  const proposed = await blockSource.getProposedCheckpointData({ number: parent });
  if (proposed) {
    return proposed.header.inboxRollingHash;
  }

  throw new Error(`Cannot source inbox rolling hash for parent checkpoint ${parent} of checkpoint ${checkpointNumber}`);
}
