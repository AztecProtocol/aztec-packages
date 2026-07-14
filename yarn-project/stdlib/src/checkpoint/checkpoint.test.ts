import { CheckpointNumber } from '@aztec/foundation/branded-types';

import { MAX_ATTESTABLE_BLOCKS_PER_CHECKPOINT } from '../deserialization/index.js';
import { Checkpoint } from './checkpoint.js';

describe('Checkpoint serialization', () => {
  it('round-trips a checkpoint with more blocks than the attestable limit', async () => {
    // Checkpoints synced from L1 can exceed the attestable limit, so deserialization must accept them
    // up to the blob-capacity ceiling rather than truncating or throwing at the attestable limit.
    const numBlocks = MAX_ATTESTABLE_BLOCKS_PER_CHECKPOINT + 1;
    const checkpoint = await Checkpoint.random(CheckpointNumber(1), { numBlocks });

    const roundTripped = Checkpoint.fromBuffer(checkpoint.toBuffer());

    expect(roundTripped.blocks.length).toBe(numBlocks);
    expect(roundTripped.toBuffer()).toEqual(checkpoint.toBuffer());
  });
});
