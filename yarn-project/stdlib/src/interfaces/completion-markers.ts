import type { EpochNumber } from '@aztec/foundation/branded-types';

import { createHash } from 'node:crypto';

import { ProvingRequestType } from '../proofs/proving_request_type.js';
import { type ProvingJobId, makeProvingJobId } from './proving-job.js';

/** Deterministic job ID for a checkpoint sub-tree completion marker. */
export function makeSubTreeCompleteJobId(epoch: EpochNumber, checkpointIndex: number): ProvingJobId {
  const hash = createHash('sha256').update(`sub-tree:${epoch}:${checkpointIndex}`).digest('hex');
  return makeProvingJobId(epoch, ProvingRequestType.CHECKPOINT_SUB_TREE_COMPLETE, hash);
}

/** Deterministic job ID for a top-tree completion marker. */
export function makeTopTreeCompleteJobId(epoch: EpochNumber): ProvingJobId {
  const hash = createHash('sha256').update(`top-tree:${epoch}`).digest('hex');
  return makeProvingJobId(epoch, ProvingRequestType.TOP_TREE_COMPLETE, hash);
}
