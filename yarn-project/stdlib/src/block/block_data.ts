import { CheckpointNumberSchema, IndexWithinCheckpointSchema } from '@aztec/foundation/branded-types';
import type { CheckpointNumber, IndexWithinCheckpoint } from '@aztec/foundation/branded-types';
import { schemas } from '@aztec/foundation/schemas';

import { z } from 'zod';

import { AppendOnlyTreeSnapshot } from '../trees/append_only_tree_snapshot.js';
import { BlockHeader } from '../tx/block_header.js';
import { BlockHash } from './block_hash.js';

/** L2Block metadata. Equivalent to L2Block but without block body containing tx data. */
export type BlockData = {
  header: BlockHeader;
  archive: AppendOnlyTreeSnapshot;
  blockHash: BlockHash;
  checkpointNumber: CheckpointNumber;
  indexWithinCheckpoint: IndexWithinCheckpoint;
};

export const BlockDataSchema = z.object({
  header: BlockHeader.schema,
  archive: AppendOnlyTreeSnapshot.schema,
  blockHash: schemas.Fr.transform(fr => new BlockHash(fr)),
  checkpointNumber: CheckpointNumberSchema,
  indexWithinCheckpoint: IndexWithinCheckpointSchema,
});
