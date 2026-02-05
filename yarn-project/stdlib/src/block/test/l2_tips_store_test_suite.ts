import { GENESIS_BLOCK_HEADER_HASH } from '@aztec/constants';
import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { times } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import {
  type CheckpointId,
  GENESIS_CHECKPOINT_HEADER_HASH,
  L2Block,
  type L2BlockId,
  type L2TipId,
} from '@aztec/stdlib/block';
import { Checkpoint, L1PublishedData, PublishedCheckpoint } from '@aztec/stdlib/checkpoint';

import { jestExpect as expect } from '@jest/expect';

import type { L2TipsStore } from '../l2_block_stream/index.js';

export function testL2TipsStore(makeTipsStore: () => Promise<L2TipsStore>) {
  let tipsStore: L2TipsStore;
  // Track blocks and their hashes for test assertions
  const blockHashes: Map<number, string> = new Map();
  // Track checkpoints and their hashes
  const checkpointHashes: Map<number, string> = new Map();
  // Track which blocks belong to which checkpoint
  const blockToCheckpoint: Map<number, number> = new Map();

  beforeEach(async () => {
    tipsStore = await makeTipsStore();
    blockHashes.clear();
    checkpointHashes.clear();
    blockToCheckpoint.clear();
  });

  const makeBlock = async (number: number): Promise<L2Block> => {
    const block = await L2Block.random(BlockNumber(number));
    blockHashes.set(number, (await block.hash()).toString());
    return block;
  };

  const makeBlockId = (number: number): L2BlockId => ({
    number: BlockNumber(number),
    hash: blockHashes.get(number) ?? new Fr(number).toString(),
  });

  const makeTip = (number: number): L2BlockId => ({
    number: BlockNumber(number),
    hash: number === 0 ? GENESIS_BLOCK_HEADER_HASH.toString() : (blockHashes.get(number) ?? new Fr(number).toString()),
  });

  const makeCheckpointIdForBlock = (blockNumber: number): CheckpointId => {
    if (blockNumber === 0) {
      return { number: CheckpointNumber.ZERO, hash: GENESIS_CHECKPOINT_HEADER_HASH.toString() };
    }
    const checkpointNum = blockToCheckpoint.get(blockNumber);
    if (checkpointNum === undefined) {
      return { number: CheckpointNumber.ZERO, hash: GENESIS_CHECKPOINT_HEADER_HASH.toString() };
    }
    const hash = checkpointHashes.get(checkpointNum);
    if (!hash) {
      return { number: CheckpointNumber.ZERO, hash: GENESIS_CHECKPOINT_HEADER_HASH.toString() };
    }
    return { number: CheckpointNumber(checkpointNum), hash };
  };

  const makeTipId = (blockNumber: number): L2TipId => ({
    block: makeTip(blockNumber),
    checkpoint: makeCheckpointIdForBlock(blockNumber),
  });

  const makeTips = (proposed: number, proven: number, finalized: number, checkpointed: number = 0) => ({
    proposed: makeTip(proposed),
    proven: makeTipId(proven),
    finalized: makeTipId(finalized),
    checkpointed: makeTipId(checkpointed),
  });

  const makeCheckpoint = async (checkpointNumber: number, blocks: L2Block[]): Promise<PublishedCheckpoint> => {
    const checkpoint = await Checkpoint.random(CheckpointNumber(checkpointNumber), {
      numBlocks: blocks.length,
      startBlockNumber: blocks[0].number,
    });
    // Override the blocks with our actual blocks (to keep hashes consistent)
    (checkpoint as any).blocks = blocks;

    const checkpointHash = checkpoint.hash().toString();
    checkpointHashes.set(checkpointNumber, checkpointHash);

    // Track which blocks belong to this checkpoint
    for (const block of blocks) {
      blockToCheckpoint.set(block.number, checkpointNumber);
    }

    return new PublishedCheckpoint(checkpoint, L1PublishedData.random(), []);
  };

  /** Creates a chain-checkpointed event with the required block field */
  const makeCheckpointedEvent = async (checkpoint: PublishedCheckpoint) => {
    const lastBlock = checkpoint.checkpoint.blocks.at(-1)!;
    const blockId: L2BlockId = {
      number: lastBlock.number,
      hash: (await lastBlock.hash()).toString(),
    };
    return { type: 'chain-checkpointed' as const, checkpoint, block: blockId };
  };

  it('returns zero if no tips are stored', async () => {
    const tips = await tipsStore.getL2Tips();
    expect(tips).toEqual(makeTips(0, 0, 0));
  });

  it('sets proposed tip from blocks added', async () => {
    await tipsStore.handleBlockStreamEvent({
      type: 'blocks-added',
      blocks: await Promise.all(times(3, i => makeBlock(i + 1))),
    });

    const tips = await tipsStore.getL2Tips();
    expect(tips).toEqual(makeTips(3, 0, 0));

    expect(await tipsStore.getL2BlockHash(1)).toEqual(blockHashes.get(1));
    expect(await tipsStore.getL2BlockHash(2)).toEqual(blockHashes.get(2));
    expect(await tipsStore.getL2BlockHash(3)).toEqual(blockHashes.get(3));
  });

  it('checkpoints all proposed blocks', async () => {
    // Propose blocks 1-5
    const blocks = await Promise.all(times(5, i => makeBlock(i + 1)));
    await tipsStore.handleBlockStreamEvent({ type: 'blocks-added', blocks });

    // Checkpoint all proposed blocks (1-5)
    const checkpoint1 = await makeCheckpoint(1, blocks);
    await tipsStore.handleBlockStreamEvent(await makeCheckpointedEvent(checkpoint1));

    const tips = await tipsStore.getL2Tips();
    // Proposed and checkpointed should be the same
    expect(tips.proposed).toEqual(makeTip(5));
    expect(tips.checkpointed.block).toEqual(makeTip(5));
    expect(tips.checkpointed.checkpoint.number).toEqual(CheckpointNumber(1));
  });

  it('advances proven chain with checkpoint info', async () => {
    // Propose and checkpoint blocks 1-5
    const blocks = await Promise.all(times(5, i => makeBlock(i + 1)));
    await tipsStore.handleBlockStreamEvent({ type: 'blocks-added', blocks });
    const checkpoint1 = await makeCheckpoint(1, blocks);
    await tipsStore.handleBlockStreamEvent(await makeCheckpointedEvent(checkpoint1));

    // Prove up to block 5
    await tipsStore.handleBlockStreamEvent({ type: 'chain-proven', block: makeBlockId(5) });

    const tips = await tipsStore.getL2Tips();
    expect(tips.proposed).toEqual(makeTip(5));
    expect(tips.checkpointed.block).toEqual(makeTip(5));
    expect(tips.proven.block).toEqual(makeTip(5));

    // Proven tip should have the checkpoint info
    expect(tips.proven.checkpoint.number).toEqual(CheckpointNumber(1));
    expect(tips.proven.checkpoint.hash).toEqual(checkpointHashes.get(1));
  });

  it('advances finalized chain with checkpoint info', async () => {
    // Propose and checkpoint blocks 1-5
    const blocks = await Promise.all(times(5, i => makeBlock(i + 1)));
    await tipsStore.handleBlockStreamEvent({ type: 'blocks-added', blocks });
    const checkpoint1 = await makeCheckpoint(1, blocks);
    await tipsStore.handleBlockStreamEvent(await makeCheckpointedEvent(checkpoint1));

    // Prove and finalize
    await tipsStore.handleBlockStreamEvent({ type: 'chain-proven', block: makeBlockId(5) });
    await tipsStore.handleBlockStreamEvent({ type: 'chain-finalized', block: makeBlockId(5) });

    const tips = await tipsStore.getL2Tips();
    expect(tips.proposed).toEqual(makeTip(5));
    expect(tips.checkpointed.block).toEqual(makeTip(5));
    expect(tips.proven.block).toEqual(makeTip(5));
    expect(tips.finalized.block).toEqual(makeTip(5));

    // Finalized tip should have checkpoint info
    expect(tips.finalized.checkpoint.number).toEqual(CheckpointNumber(1));
    expect(tips.finalized.checkpoint.hash).toEqual(checkpointHashes.get(1));
  });

  it('handles multiple checkpoints advancing the chain', async () => {
    // Propose blocks 1-5
    const blocks1 = await Promise.all(times(5, i => makeBlock(i + 1)));
    await tipsStore.handleBlockStreamEvent({ type: 'blocks-added', blocks: blocks1 });

    // Checkpoint 1: all proposed blocks 1-5
    const checkpoint1 = await makeCheckpoint(1, blocks1);
    await tipsStore.handleBlockStreamEvent(await makeCheckpointedEvent(checkpoint1));

    // Propose more blocks 6-10
    const blocks2 = await Promise.all(times(5, i => makeBlock(i + 6)));
    await tipsStore.handleBlockStreamEvent({ type: 'blocks-added', blocks: blocks2 });

    // Checkpoint 2: all remaining proposed blocks 6-10
    const checkpoint2 = await makeCheckpoint(2, blocks2);
    await tipsStore.handleBlockStreamEvent(await makeCheckpointedEvent(checkpoint2));

    const tips = await tipsStore.getL2Tips();
    expect(tips.proposed).toEqual(makeTip(10));
    expect(tips.checkpointed.block).toEqual(makeTip(10));
    expect(tips.checkpointed.checkpoint.number).toEqual(CheckpointNumber(2));
    expect(tips.checkpointed.checkpoint.hash).toEqual(checkpointHashes.get(2));
  });

  it('clears block hashes when setting finalized chain', async () => {
    // Propose blocks 1-3
    const blocks1to3 = await Promise.all(times(3, i => makeBlock(i + 1)));
    await tipsStore.handleBlockStreamEvent({ type: 'blocks-added', blocks: blocks1to3 });

    // Checkpoint all proposed blocks (1-3)
    const checkpoint1 = await makeCheckpoint(1, blocks1to3);
    await tipsStore.handleBlockStreamEvent(await makeCheckpointedEvent(checkpoint1));

    // Propose more blocks 4-5
    const blocks4to5 = await Promise.all(times(2, i => makeBlock(i + 4)));
    await tipsStore.handleBlockStreamEvent({ type: 'blocks-added', blocks: blocks4to5 });

    // Checkpoint all remaining proposed blocks (4-5)
    const checkpoint2 = await makeCheckpoint(2, blocks4to5);
    await tipsStore.handleBlockStreamEvent(await makeCheckpointedEvent(checkpoint2));

    // Prove and finalize up to block 3 (checkpoint 1)
    await tipsStore.handleBlockStreamEvent({ type: 'chain-proven', block: makeBlockId(3) });
    await tipsStore.handleBlockStreamEvent({ type: 'chain-finalized', block: makeBlockId(3) });

    // Blocks before finalized should be cleared
    expect(await tipsStore.getL2BlockHash(1)).toBeUndefined();
    expect(await tipsStore.getL2BlockHash(2)).toBeUndefined();

    // Finalized and later blocks should remain
    expect(await tipsStore.getL2BlockHash(3)).toEqual(blockHashes.get(3));
    expect(await tipsStore.getL2BlockHash(4)).toEqual(blockHashes.get(4));
    expect(await tipsStore.getL2BlockHash(5)).toEqual(blockHashes.get(5));
  });

  it('handles chain pruning by updating proposed tip', async () => {
    const blocks = await Promise.all(times(10, i => makeBlock(i + 1)));
    await tipsStore.handleBlockStreamEvent({ type: 'blocks-added', blocks });

    // Prune to block 5
    await tipsStore.handleBlockStreamEvent({
      type: 'chain-pruned',
      block: makeBlockId(5),
      checkpoint: { number: CheckpointNumber.ZERO, hash: GENESIS_CHECKPOINT_HEADER_HASH.toString() },
    });

    const tips = await tipsStore.getL2Tips();
    expect(tips.proposed).toEqual(makeTip(5));
  });

  it('handles pruning proposed chain to genesis, re-proposing, and checkpointing', async () => {
    // Propose blocks 1-3
    const firstBlocks = await Promise.all(times(3, i => makeBlock(i + 1)));
    await tipsStore.handleBlockStreamEvent({ type: 'blocks-added', blocks: firstBlocks });

    let tips = await tipsStore.getL2Tips();
    expect(tips.proposed).toEqual(makeTip(3));

    // Store original hashes
    const originalHash1 = blockHashes.get(1);
    const originalHash2 = blockHashes.get(2);
    const originalHash3 = blockHashes.get(3);

    // Prune back to genesis (block 0)
    await tipsStore.handleBlockStreamEvent({
      type: 'chain-pruned',
      block: makeTip(0),
      checkpoint: { number: CheckpointNumber.ZERO, hash: GENESIS_CHECKPOINT_HEADER_HASH.toString() },
    });

    tips = await tipsStore.getL2Tips();
    expect(tips.proposed).toEqual(makeTip(0));
    expect(tips.checkpointed.block).toEqual(makeTip(0));

    // Clear hashes and propose new blocks 1-3 (different from original)
    blockHashes.delete(1);
    blockHashes.delete(2);
    blockHashes.delete(3);
    const newBlocks = await Promise.all(times(3, i => makeBlock(i + 1)));
    await tipsStore.handleBlockStreamEvent({ type: 'blocks-added', blocks: newBlocks });

    // Verify new blocks have different hashes
    expect(blockHashes.get(1)).not.toEqual(originalHash1);
    expect(blockHashes.get(2)).not.toEqual(originalHash2);
    expect(blockHashes.get(3)).not.toEqual(originalHash3);

    tips = await tipsStore.getL2Tips();
    expect(tips.proposed).toEqual(makeTip(3));
    expect(tips.checkpointed.block).toEqual(makeTip(0)); // Not yet checkpointed

    // Checkpoint all the new proposed blocks (1-3)
    const checkpoint1 = await makeCheckpoint(1, newBlocks);
    await tipsStore.handleBlockStreamEvent(await makeCheckpointedEvent(checkpoint1));

    tips = await tipsStore.getL2Tips();
    expect(tips.proposed).toEqual(makeTip(3));
    expect(tips.checkpointed.block).toEqual(makeTip(3));
    expect(tips.checkpointed.checkpoint.number).toEqual(CheckpointNumber(1));

    // Verify block hashes in store are the new ones
    expect(await tipsStore.getL2BlockHash(1)).toEqual(blockHashes.get(1));
    expect(await tipsStore.getL2BlockHash(2)).toEqual(blockHashes.get(2));
    expect(await tipsStore.getL2BlockHash(3)).toEqual(blockHashes.get(3));
  });

  it('handles reorg: prune proposed blocks back to checkpoint, then re-propose with different blocks', async () => {
    // Propose blocks 1-5
    const firstBlocks = await Promise.all(times(5, i => makeBlock(i + 1)));
    await tipsStore.handleBlockStreamEvent({ type: 'blocks-added', blocks: firstBlocks });

    // Checkpoint all proposed blocks (1-5) - these are now committed
    const checkpoint1 = await makeCheckpoint(1, firstBlocks);
    await tipsStore.handleBlockStreamEvent(await makeCheckpointedEvent(checkpoint1));

    // Propose more blocks 6-10 (not yet checkpointed, can be pruned)
    const originalBlocks6to10 = await Promise.all(times(5, i => makeBlock(i + 6)));
    await tipsStore.handleBlockStreamEvent({ type: 'blocks-added', blocks: originalBlocks6to10 });

    let tips = await tipsStore.getL2Tips();
    expect(tips.proposed).toEqual(makeTip(10));
    expect(tips.checkpointed.block).toEqual(makeTip(5)); // Only blocks 1-5 are checkpointed

    // Store original hashes for proposed (non-checkpointed) blocks 6-8
    const originalHash6 = blockHashes.get(6);
    const originalHash7 = blockHashes.get(7);
    const originalHash8 = blockHashes.get(8);

    // Prune proposed blocks back to checkpoint (block 5)
    // This removes proposed blocks 6-10, but checkpoint remains at 5
    await tipsStore.handleBlockStreamEvent({
      type: 'chain-pruned',
      block: makeBlockId(5),
      checkpoint: { number: CheckpointNumber.ZERO, hash: GENESIS_CHECKPOINT_HEADER_HASH.toString() },
    });

    tips = await tipsStore.getL2Tips();
    expect(tips.proposed).toEqual(makeTip(5));
    expect(tips.checkpointed.block).toEqual(makeTip(5)); // Checkpoint unchanged

    // Propose new blocks 6-8 (different from original 6-10)
    blockHashes.delete(6);
    blockHashes.delete(7);
    blockHashes.delete(8);
    const newBlocks = await Promise.all(times(3, i => makeBlock(i + 6)));
    await tipsStore.handleBlockStreamEvent({ type: 'blocks-added', blocks: newBlocks });

    // Verify the new blocks have different hashes than the original ones
    expect(blockHashes.get(6)).not.toEqual(originalHash6);
    expect(blockHashes.get(7)).not.toEqual(originalHash7);
    expect(blockHashes.get(8)).not.toEqual(originalHash8);

    tips = await tipsStore.getL2Tips();
    expect(tips.proposed).toEqual(makeTip(8));
    expect(tips.checkpointed.block).toEqual(makeTip(5)); // Still at checkpoint 1

    // Checkpoint all the new proposed blocks (6-8)
    const checkpoint2 = await makeCheckpoint(2, newBlocks);
    await tipsStore.handleBlockStreamEvent(await makeCheckpointedEvent(checkpoint2));

    tips = await tipsStore.getL2Tips();
    expect(tips.proposed).toEqual(makeTip(8));
    expect(tips.checkpointed.block).toEqual(makeTip(8));
    expect(tips.checkpointed.checkpoint.number).toEqual(CheckpointNumber(2));

    // Block hashes in the store should reflect the new blocks
    expect(await tipsStore.getL2BlockHash(6)).toEqual(blockHashes.get(6));
    expect(await tipsStore.getL2BlockHash(7)).toEqual(blockHashes.get(7));
    expect(await tipsStore.getL2BlockHash(8)).toEqual(blockHashes.get(8));

    // And should NOT equal the original hashes
    expect(await tipsStore.getL2BlockHash(6)).not.toEqual(originalHash6);
    expect(await tipsStore.getL2BlockHash(7)).not.toEqual(originalHash7);
    expect(await tipsStore.getL2BlockHash(8)).not.toEqual(originalHash8);
  });

  it('handles reorg with different chain length after prune', async () => {
    // Propose blocks 1-3
    const firstBlocks = await Promise.all(times(3, i => makeBlock(i + 1)));
    await tipsStore.handleBlockStreamEvent({ type: 'blocks-added', blocks: firstBlocks });

    // Checkpoint all proposed blocks (1-3) - these are now committed
    const checkpoint1 = await makeCheckpoint(1, firstBlocks);
    await tipsStore.handleBlockStreamEvent(await makeCheckpointedEvent(checkpoint1));

    // Propose more blocks 4-10 (not yet checkpointed, can be pruned)
    const originalBlocks4to10 = await Promise.all(times(7, i => makeBlock(i + 4)));
    await tipsStore.handleBlockStreamEvent({ type: 'blocks-added', blocks: originalBlocks4to10 });

    let tips = await tipsStore.getL2Tips();
    expect(tips.proposed).toEqual(makeTip(10));
    expect(tips.checkpointed.block).toEqual(makeTip(3)); // Only blocks 1-3 are checkpointed

    // Prune proposed blocks back to checkpoint (block 3)
    await tipsStore.handleBlockStreamEvent({
      type: 'chain-pruned',
      block: makeBlockId(3),
      checkpoint: { number: CheckpointNumber.ZERO, hash: GENESIS_CHECKPOINT_HEADER_HASH.toString() },
    });

    tips = await tipsStore.getL2Tips();
    expect(tips.proposed).toEqual(makeTip(3));
    expect(tips.checkpointed.block).toEqual(makeTip(3)); // Checkpoint unchanged

    // Now propose only 2 new blocks (4-5) instead of the original 7 blocks (4-10)
    blockHashes.delete(4);
    blockHashes.delete(5);
    const newBlocks = await Promise.all(times(2, i => makeBlock(i + 4)));
    await tipsStore.handleBlockStreamEvent({ type: 'blocks-added', blocks: newBlocks });

    tips = await tipsStore.getL2Tips();
    expect(tips.proposed).toEqual(makeTip(5));
    expect(tips.checkpointed.block).toEqual(makeTip(3)); // Still at checkpoint 1

    // Checkpoint all the new proposed blocks (4-5)
    const checkpoint2 = await makeCheckpoint(2, newBlocks);
    await tipsStore.handleBlockStreamEvent(await makeCheckpointedEvent(checkpoint2));

    tips = await tipsStore.getL2Tips();
    expect(tips.proposed).toEqual(makeTip(5));
    expect(tips.checkpointed.block).toEqual(makeTip(5));
    expect(tips.checkpointed.checkpoint.number).toEqual(CheckpointNumber(2));
  });

  it('handles reorg: prune back to proven tip (including checkpointed blocks), then re-propose and checkpoint', async () => {
    // Propose blocks 1-3
    const firstBlocks = await Promise.all(times(3, i => makeBlock(i + 1)));
    await tipsStore.handleBlockStreamEvent({ type: 'blocks-added', blocks: firstBlocks });

    // Checkpoint all proposed blocks (1-3)
    const checkpoint1 = await makeCheckpoint(1, firstBlocks);
    await tipsStore.handleBlockStreamEvent(await makeCheckpointedEvent(checkpoint1));

    // Prove up to block 3
    await tipsStore.handleBlockStreamEvent({ type: 'chain-proven', block: makeBlockId(3) });

    let tips = await tipsStore.getL2Tips();
    expect(tips.proposed).toEqual(makeTip(3));
    expect(tips.checkpointed.block).toEqual(makeTip(3));
    expect(tips.proven.block).toEqual(makeTip(3));

    // Propose more blocks 4-6
    const blocks4to6 = await Promise.all(times(3, i => makeBlock(i + 4)));
    await tipsStore.handleBlockStreamEvent({ type: 'blocks-added', blocks: blocks4to6 });

    // Checkpoint blocks 4-6 (now checkpointed is ahead of proven)
    const checkpoint2 = await makeCheckpoint(2, blocks4to6);
    await tipsStore.handleBlockStreamEvent(await makeCheckpointedEvent(checkpoint2));

    tips = await tipsStore.getL2Tips();
    expect(tips.proposed).toEqual(makeTip(6));
    expect(tips.checkpointed.block).toEqual(makeTip(6));
    expect(tips.proven.block).toEqual(makeTip(3)); // Proven is behind checkpointed

    // Propose even more blocks 7-10 (proposed is now ahead of checkpointed)
    const originalBlocks7to10 = await Promise.all(times(4, i => makeBlock(i + 7)));
    await tipsStore.handleBlockStreamEvent({ type: 'blocks-added', blocks: originalBlocks7to10 });

    tips = await tipsStore.getL2Tips();
    // Now all three tips are different: proposed=10, checkpointed=6, proven=3
    expect(tips.proposed).toEqual(makeTip(10));
    expect(tips.checkpointed.block).toEqual(makeTip(6));
    expect(tips.proven.block).toEqual(makeTip(3));

    // Store original hashes for blocks 4-7
    const originalHash4 = blockHashes.get(4);
    const originalHash5 = blockHashes.get(5);
    const originalHash6 = blockHashes.get(6);
    const originalHash7 = blockHashes.get(7);

    // Prune all the way back to proven tip (block 3)
    // This prunes both proposed blocks (7-10) AND checkpointed blocks (4-6)
    await tipsStore.handleBlockStreamEvent({
      type: 'chain-pruned',
      block: makeBlockId(3),
      checkpoint: { number: CheckpointNumber.ZERO, hash: GENESIS_CHECKPOINT_HEADER_HASH.toString() },
    });

    tips = await tipsStore.getL2Tips();
    expect(tips.proposed).toEqual(makeTip(3));
    expect(tips.checkpointed.block).toEqual(makeTip(3)); // Checkpointed also pruned back
    expect(tips.proven.block).toEqual(makeTip(3));

    // Propose new blocks 4-7 (different from original)
    blockHashes.delete(4);
    blockHashes.delete(5);
    blockHashes.delete(6);
    blockHashes.delete(7);
    const newBlocks = await Promise.all(times(4, i => makeBlock(i + 4)));
    await tipsStore.handleBlockStreamEvent({ type: 'blocks-added', blocks: newBlocks });

    // Verify the new blocks have different hashes than the original ones
    expect(blockHashes.get(4)).not.toEqual(originalHash4);
    expect(blockHashes.get(5)).not.toEqual(originalHash5);
    expect(blockHashes.get(6)).not.toEqual(originalHash6);
    expect(blockHashes.get(7)).not.toEqual(originalHash7);

    tips = await tipsStore.getL2Tips();
    expect(tips.proposed).toEqual(makeTip(7));
    expect(tips.proven.block).toEqual(makeTip(3));

    // Checkpoint all the new proposed blocks (4-7)
    const checkpoint3 = await makeCheckpoint(3, newBlocks);
    await tipsStore.handleBlockStreamEvent(await makeCheckpointedEvent(checkpoint3));

    tips = await tipsStore.getL2Tips();
    expect(tips.proposed).toEqual(makeTip(7));
    expect(tips.checkpointed.block).toEqual(makeTip(7));
    expect(tips.checkpointed.checkpoint.number).toEqual(CheckpointNumber(3));
    expect(tips.proven.block).toEqual(makeTip(3)); // Proven hasn't moved yet

    // Block hashes in the store should reflect the new blocks
    expect(await tipsStore.getL2BlockHash(4)).toEqual(blockHashes.get(4));
    expect(await tipsStore.getL2BlockHash(5)).toEqual(blockHashes.get(5));
    expect(await tipsStore.getL2BlockHash(6)).toEqual(blockHashes.get(6));
    expect(await tipsStore.getL2BlockHash(7)).toEqual(blockHashes.get(7));

    // And should NOT equal the original hashes
    expect(await tipsStore.getL2BlockHash(4)).not.toEqual(originalHash4);
    expect(await tipsStore.getL2BlockHash(5)).not.toEqual(originalHash5);
    expect(await tipsStore.getL2BlockHash(6)).not.toEqual(originalHash6);
    expect(await tipsStore.getL2BlockHash(7)).not.toEqual(originalHash7);
  });

  // Regression test for #13142
  it('does not blow up when setting proven chain on an unseen block number', async () => {
    await tipsStore.handleBlockStreamEvent({ type: 'blocks-added', blocks: [await makeBlock(5)] });
    await tipsStore.handleBlockStreamEvent({ type: 'chain-proven', block: makeBlockId(3) });

    const tips = await tipsStore.getL2Tips();
    expect(tips.proposed).toEqual(makeTip(5));
    expect(tips.proven.block).toEqual(makeTip(3));
    // No checkpoint for block 3 since it wasn't checkpointed
    expect(tips.proven.checkpoint.number).toEqual(CheckpointNumber.ZERO);
  });
}
