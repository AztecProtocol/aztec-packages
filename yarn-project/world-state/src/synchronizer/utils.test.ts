import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { timesParallel } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { L2BlockSource } from '@aztec/stdlib/block';
import type { Checkpoint } from '@aztec/stdlib/checkpoint';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';

import { type MockProxy, mock } from 'jest-mock-extended';

import { mockCheckpoint } from '../test/utils.js';
import { findFirstBlocksInCheckpoints } from './utils.js';

describe('findFirstBlocksInCheckpoints', () => {
  let checkpoints: { checkpoint: Checkpoint; messages: Fr[] }[];
  let blockAndMessagesSource: MockProxy<L2BlockSource & L1ToL2MessageSource>;

  beforeAll(async () => {
    // Generate 4 mock checkpoints, each with i + 1 blocks and i messages.
    // The result should be:
    // Checkpoint 1: [Block 1]
    // Checkpoint 2: [Block 2, Block 3]
    // Checkpoint 3: [Block 4, Block 5, Block 6]
    // Checkpoint 4: [Block 7, Block 8, Block 9, Block 10]
    checkpoints = await timesParallel(4, i =>
      mockCheckpoint(CheckpointNumber(i + 1), {
        numBlocks: i + 1,
        startBlockNumber: Array(i + 1)
          .fill(0)
          .reduce((acc, _, index) => acc + index, 1),
        numL1ToL2Messages: i,
      }),
    );
  });

  beforeEach(() => {
    blockAndMessagesSource = mock<L2BlockSource & L1ToL2MessageSource>();

    blockAndMessagesSource.getBlockHeader.mockImplementation(blockNumber => {
      return Promise.resolve(checkpoints.flatMap(c => c.checkpoint.blocks).find(b => b.number === blockNumber)?.header);
    });

    blockAndMessagesSource.getCheckpointByArchive.mockImplementation(archiveRoot => {
      return Promise.resolve(
        checkpoints.find(c => c.checkpoint.blocks.at(-1)!.archive.root.equals(archiveRoot))?.checkpoint,
      );
    });

    blockAndMessagesSource.getL1ToL2MessagesForCheckpoint.mockImplementation(checkpointNumber => {
      return Promise.resolve(checkpoints.find(c => c.checkpoint.number === checkpointNumber)?.messages ?? []);
    });

    blockAndMessagesSource.getL1ToL2Messages.mockImplementation(blockNumber => {
      // The messages of a checkpoint are added for the first block in the checkpoint.
      return Promise.resolve(checkpoints.find(c => c.checkpoint.blocks[0].number === blockNumber)?.messages ?? []);
    });
  });

  it('identifies block 1 as first block in checkpoint', async () => {
    const blocks = [checkpoints[0].checkpoint.blocks[0]];

    const result = await findFirstBlocksInCheckpoints(blocks, blockAndMessagesSource);

    expect(result.size).toBe(1);
    expect(result.get(BlockNumber(1))).toEqual(checkpoints[0].messages);
  });

  it('identifies first block even when not all blocks in the checkpoint are added', async () => {
    // Only add block 2 for checkpoint 2.
    const blocks = [checkpoints[1].checkpoint.blocks[0]];

    const result = await findFirstBlocksInCheckpoints(blocks, blockAndMessagesSource);

    expect(result.size).toBe(1);
    expect(result.get(BlockNumber(2))).toEqual(checkpoints[1].messages);
  });

  it('does not identify blocks[0] as first block if previous block was in the same slot', async () => {
    // Add all blocks except the first one from checkpoint 2.
    const blocks = checkpoints[1].checkpoint.blocks.slice(1);

    const result = await findFirstBlocksInCheckpoints(blocks, blockAndMessagesSource);

    expect(result.size).toBe(0);
  });

  it('handles blocks in the middle of a checkpoint', async () => {
    // Add all blocks from checkpoint 4 except the first and the last ones.
    const blocks = checkpoints[3].checkpoint.blocks.slice(1, -1);

    const result = await findFirstBlocksInCheckpoints(blocks, blockAndMessagesSource);

    expect(result.size).toBe(0);
  });

  it('identifies a first block at the end of the given blocks', async () => {
    const blocks = [checkpoints[1].checkpoint.blocks[1], checkpoints[2].checkpoint.blocks[0]];

    const result = await findFirstBlocksInCheckpoints(blocks, blockAndMessagesSource);

    expect(result.size).toBe(1);
    expect(result.get(BlockNumber(4))).toEqual(checkpoints[2].messages);
  });

  it('identifies all first blocks in all checkpoints', async () => {
    // Add all blocks from all checkpoints.
    const blocks = checkpoints.flatMap(c => c.checkpoint.blocks);

    const result = await findFirstBlocksInCheckpoints(blocks, blockAndMessagesSource);

    expect(result.size).toBe(4);
    expect(result.get(BlockNumber(1))).toEqual(checkpoints[0].messages);
    expect(result.get(BlockNumber(2))).toEqual(checkpoints[1].messages);
    expect(result.get(BlockNumber(4))).toEqual(checkpoints[2].messages);
    expect(result.get(BlockNumber(7))).toEqual(checkpoints[3].messages);
  });

  it('identifies multiple first blocks across checkpoints', async () => {
    // Add all blocks from all checkpoints.
    const blocks = [
      checkpoints[1].checkpoint.blocks[1],
      ...checkpoints[2].checkpoint.blocks,
      ...checkpoints[3].checkpoint.blocks,
    ];

    const result = await findFirstBlocksInCheckpoints(blocks, blockAndMessagesSource);

    expect(result.size).toBe(2);
    expect(result.get(BlockNumber(4))).toEqual(checkpoints[2].messages);
    expect(result.get(BlockNumber(7))).toEqual(checkpoints[3].messages);
  });

  it('throws error if previous block header cannot be fetched', async () => {
    // Return undefined for the previous block header.
    blockAndMessagesSource.getBlockHeader.mockResolvedValue(undefined);

    const blocks = checkpoints[1].checkpoint.blocks;

    await expect(findFirstBlocksInCheckpoints(blocks, blockAndMessagesSource)).rejects.toThrow(/Failed to get block 1/);
  });

  it('throws error if L1 to L2 messages do not hash to checkpoint inHash', async () => {
    // Return random messages for the checkpoint.
    blockAndMessagesSource.getL1ToL2MessagesForCheckpoint.mockResolvedValue([Fr.random(), Fr.random()]);

    const blocks = checkpoints[1].checkpoint.blocks;

    await expect(findFirstBlocksInCheckpoints(blocks, blockAndMessagesSource)).rejects.toThrow(
      /Obtained L1 to L2 messages failed to be hashed to the checkpoint inHash/,
    );
  });
});
