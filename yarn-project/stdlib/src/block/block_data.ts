import { CheckpointNumberSchema, IndexWithinCheckpointSchema } from '@aztec/foundation/branded-types';
import type { CheckpointNumber, IndexWithinCheckpoint } from '@aztec/foundation/branded-types';
import type { Fr } from '@aztec/foundation/curves/bn254';
import { schemas } from '@aztec/foundation/schemas';

import { z } from 'zod';

import { AppendOnlyTreeSnapshot } from '../trees/append_only_tree_snapshot.js';
import { BlockHeader } from '../tx/block_header.js';

/** L2Block metadata. Equivalent to L2Block but without block body containing tx data. */
export type BlockData = {
  header: BlockHeader;
  archive: AppendOnlyTreeSnapshot;
  blockHash: Fr;
  checkpointNumber: CheckpointNumber;
  indexWithinCheckpoint: IndexWithinCheckpoint;
};

export const BlockDataSchema = z.object({
  header: BlockHeader.schema,
  archive: AppendOnlyTreeSnapshot.schema,
  blockHash: schemas.Fr,
  checkpointNumber: CheckpointNumberSchema,
  indexWithinCheckpoint: IndexWithinCheckpointSchema,
});
