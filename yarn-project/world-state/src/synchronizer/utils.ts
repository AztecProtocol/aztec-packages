import { BlockNumber, type SlotNumber } from '@aztec/foundation/branded-types';
import type { Fr } from '@aztec/foundation/fields';
import type { L2BlockNew, L2BlockSource } from '@aztec/stdlib/block';
import type { Checkpoint } from '@aztec/stdlib/checkpoint';
import { type L1ToL2MessageSource, computeInHashFromL1ToL2Messages } from '@aztec/stdlib/messaging';

/**
 * Determine which blocks in the given array are the first block in a checkpoint.
 * @param blocks - The candidate blocks, sorted by block number in ascending order.
 * @param l2BlockSource - The L2 block source to use to fetch the checkpoints, block headers and L1->L2 messages.
 * @returns A map of block numbers that begin a checkpoint to the L1->L2 messages for that checkpoint.
 */
export async function findFirstBlocksInCheckpoints(
  blocks: L2BlockNew[],
  l2BlockSource: L2BlockSource & L1ToL2MessageSource,
): Promise<Map<number, Fr[]>> {
  // Select the blocks that are the final block within each group of identical slot numbers.
  let seenSlot: SlotNumber | undefined;
  const maybeLastBlocks = [...blocks]
    .reverse()
    .filter(b => {
      if (b.header.globalVariables.slotNumber !== seenSlot) {
        seenSlot = b.header.globalVariables.slotNumber;
        return true;
      }
      return false;
    })
    .reverse();

  // Try to fetch the checkpoints for those blocks. If undefined (which should only occur for blocks.at(-1)),
  // then the block is not the last one in a checkpoint.
  // If we are not checking the inHashes below, only blocks.at(-1) would need its checkpoint header fetched.
  const checkpointedBlocks = (
    await Promise.all(
      maybeLastBlocks.map(async b => ({
        blockNumber: b.number,
        // A checkpoint's archive root is the archive root of its last block.
        checkpoint: await l2BlockSource.getCheckpointByArchive(b.archive.root),
      })),
    )
  ).filter(b => b.checkpoint !== undefined) as { blockNumber: BlockNumber; checkpoint: Checkpoint }[];

  // Verify that the L1->L2 messages hash to the checkpoint's inHash.
  const checkpointedL1ToL2Messages: Fr[][] = await Promise.all(
    checkpointedBlocks.map(b => l2BlockSource.getL1ToL2MessagesForCheckpoint(b.checkpoint!.number)),
  );
  checkpointedBlocks.forEach((b, i) => {
    const computedInHash = computeInHashFromL1ToL2Messages(checkpointedL1ToL2Messages[i]);
    const inHash = b.checkpoint.header.contentCommitment.inHash;
    if (!computedInHash.equals(inHash)) {
      throw new Error('Obtained L1 to L2 messages failed to be hashed to the checkpoint inHash');
    }
  });

  // Compute the first block numbers, which should be right after each checkpointed block. Exclude blocks that haven't
  // been added yet.
  const firstBlockNumbers = checkpointedBlocks
    .map(b => BlockNumber(b.blockNumber + 1))
    .filter(n => n <= blocks.at(-1)!.number);
  // Check if blocks[0] is the first block in a checkpoint.
  if (blocks[0].number === 1) {
    firstBlockNumbers.push(blocks[0].number);
  } else {
    const lastBlockHeader = await l2BlockSource.getBlockHeader(BlockNumber(blocks[0].number - 1));
    if (!lastBlockHeader) {
      throw new Error(`Failed to get block ${blocks[0].number - 1}`);
    }
    if (lastBlockHeader.globalVariables.slotNumber !== blocks[0].header.globalVariables.slotNumber) {
      firstBlockNumbers.push(blocks[0].number);
    }
  }

  // Fetch the L1->L2 messages for the first blocks and assign them to the map.
  const messagesByBlockNumber = new Map<BlockNumber, Fr[]>();
  await Promise.all(
    firstBlockNumbers.map(async blockNumber => {
      const l1ToL2Messages = await l2BlockSource.getL1ToL2Messages(blockNumber);
      messagesByBlockNumber.set(blockNumber, l1ToL2Messages);
    }),
  );

  return messagesByBlockNumber;
}
