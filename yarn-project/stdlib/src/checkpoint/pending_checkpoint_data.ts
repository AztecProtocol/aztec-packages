import {
  type BlockNumber,
  BlockNumberSchema,
  type CheckpointNumber,
  CheckpointNumberSchema,
} from '@aztec/foundation/branded-types';

import { z } from 'zod';

import { CheckpointHeader } from '../rollup/checkpoint_header.js';
import { schemas } from '../schemas/schemas.js';

/** Lightweight data for a pending checkpoint (attested but not yet L1-confirmed).
 *  Includes fee-relevant fields used during pipelining to compute the fee header override. */
export type PendingCheckpointData = {
  checkpointNumber: CheckpointNumber;
  header: CheckpointHeader;
  startBlock: BlockNumber;
  blockCount: number;
  totalManaUsed: bigint;
  feeAssetPriceModifier: bigint;
};

export const PendingCheckpointDataSchema = z.object({
  checkpointNumber: CheckpointNumberSchema,
  header: CheckpointHeader.schema,
  startBlock: BlockNumberSchema,
  blockCount: z.number(),
  totalManaUsed: schemas.BigInt,
  feeAssetPriceModifier: schemas.BigInt,
});
