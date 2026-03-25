import {
  type BlockNumber,
  BlockNumberSchema,
  type CheckpointNumber,
  CheckpointNumberSchema,
} from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';

import { z } from 'zod';

import { CheckpointHeader } from '../rollup/checkpoint_header.js';
import { schemas } from '../schemas/schemas.js';
import { AppendOnlyTreeSnapshot } from '../trees/append_only_tree_snapshot.js';

/** Input for setting a proposed checkpoint. The archive and checkpointOutHash are computed
 *  internally by the block store from the stored blocks. */
export type ProposedCheckpointInput = {
  checkpointNumber: CheckpointNumber;
  header: CheckpointHeader;
  startBlock: BlockNumber;
  blockCount: number;
  totalManaUsed: bigint;
  feeAssetPriceModifier: bigint;
};

/** Full data for a proposed checkpoint (proposed but not yet L1-confirmed).
 *  Includes fee-relevant fields used during pipelining to compute the fee header override. */
export type ProposedCheckpointData = ProposedCheckpointInput & {
  archive: AppendOnlyTreeSnapshot;
  checkpointOutHash: Fr;
};

export const ProposedCheckpointDataSchema = z.object({
  checkpointNumber: CheckpointNumberSchema,
  header: CheckpointHeader.schema,
  archive: AppendOnlyTreeSnapshot.schema,
  checkpointOutHash: schemas.Fr,
  startBlock: BlockNumberSchema,
  blockCount: z.number(),
  totalManaUsed: schemas.BigInt,
  feeAssetPriceModifier: schemas.BigInt,
});
