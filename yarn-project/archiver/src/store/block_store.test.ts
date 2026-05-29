import { GENESIS_ARCHIVE_ROOT, INITIAL_CHECKPOINT_NUMBER } from '@aztec/constants';
import {
  BlockNumber,
  CheckpointNumber,
  EpochNumber,
  IndexWithinCheckpoint,
  SlotNumber,
} from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { sleep } from '@aztec/foundation/sleep';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import {
  BlockHash,
  CommitteeAttestation,
  EthAddress,
  GENESIS_BLOCK_HEADER_HASH,
  L2Block,
  type ValidateCheckpointResult,
} from '@aztec/stdlib/block';
import { Checkpoint, PublishedCheckpoint, randomCheckpointInfo } from '@aztec/stdlib/checkpoint';
import { CheckpointHeader } from '@aztec/stdlib/rollup';
import '@aztec/stdlib/testing/jest';
import { AppendOnlyTreeSnapshot } from '@aztec/stdlib/trees';
import { type IndexedTxEffect, TxHash } from '@aztec/stdlib/tx';

import {
  BlockAlreadyCheckpointedError,
  BlockArchiveNotConsistentError,
  BlockCheckpointNumberNotSequentialError,
  BlockIndexNotSequentialError,
  BlockNumberNotSequentialError,
  CannotOverwriteCheckpointedBlockError,
  CheckpointNumberNotSequentialError,
  InitialCheckpointNumberNotSequentialError,
} from '../errors.js';
import {
  makeChainedCheckpoints,
  makeL1PublishedData,
  makePublishedCheckpoint,
  makeStateForBlock,
} from '../test/mock_structs.js';
import { BlockStore } from './block_store.js';
import { L2TipsCache } from './l2_tips_cache.js';

async function addProposedBlocks(
  blockStore: BlockStore,
  blocks: L2Block[],
  opts?: { force?: boolean },
): Promise<boolean> {
  let result = true;
  for (const block of blocks) {
    result = (await blockStore.addProposedBlock(block, opts)) && result;
  }
  return result;
}

describe('BlockStore', () => {
  let blockStore: BlockStore;
  let publishedCheckpoints: PublishedCheckpoint[];

  const blockNumberTests: [number, () => L2Block][] = [
    [1, () => publishedCheckpoints[0].checkpoint.blocks[0]],
    [10, () => publishedCheckpoints[9].checkpoint.blocks[0]],
    [5, () => publishedCheckpoints[4].checkpoint.blocks[0]],
  ];

  const expectCheckpointedBlockEquals = async (
    actual: L2Block,
    expectedBlock: L2Block,
    expectedCheckpoint: PublishedCheckpoint,
  ) => {
    expect(actual.header.equals(expectedBlock.header)).toBe(true);
    expect(actual.checkpointNumber).toEqual(expectedCheckpoint.checkpoint.number);
    const checkpointData = await blockStore.getCheckpointData(actual.checkpointNumber);
    expect(checkpointData?.l1).toEqual(expectedCheckpoint.l1);
    expect(checkpointData?.attestations.every((a, i) => a.equals(expectedCheckpoint.attestations[i]))).toBe(true);
  };

  beforeEach(async () => {
    blockStore = new BlockStore(await openTmpStore('block_store_test'));
    // Create checkpoints sequentially to ensure archive roots are chained properly.
    // Each block's header.lastArchive must equal the previous block's archive.
    publishedCheckpoints = [];
    const txsPerBlock = 4;
    for (let i = 0; i < 10; i++) {
      const blockNumber = i + 1;
      const previousArchive = i > 0 ? publishedCheckpoints[i - 1].checkpoint.blocks[0].archive : undefined;
      const checkpoint = await Checkpoint.random(CheckpointNumber(i + 1), {
        numBlocks: 1,
        startBlockNumber: blockNumber,
        previousArchive,
        txsPerBlock,
        state: makeStateForBlock(blockNumber, txsPerBlock),
        // Ensure each tx has public logs for getPublicLogs tests
        txOptions: { numPublicCallsPerTx: 2, numPublicLogsPerCall: 2 },
      });
      publishedCheckpoints.push(makePublishedCheckpoint(checkpoint, i + 10));
    }
  });

  describe('addCheckpoints', () => {
    it('returns success when adding checkpoints', async () => {
      await expect(blockStore.addCheckpoints(publishedCheckpoints)).resolves.toBe(true);
    });

    it('accepts duplicate checkpoints with matching archives and updates L1 info', async () => {
      // Add first 3 checkpoints
      const first3 = publishedCheckpoints.slice(0, 3);
      await blockStore.addCheckpoints(first3);

      // Verify initial L1 block number for checkpoint 3
      const beforeData = await blockStore.getCheckpointData(CheckpointNumber(3));
      expect(beforeData).toBeDefined();
      const originalL1Block = beforeData!.l1.blockNumber;

      // Re-add checkpoint 3 with the same content but different L1 published data
      // This simulates an L1 reorg that moved the checkpoint to a different L1 block
      const cp3WithNewL1 = new PublishedCheckpoint(
        first3[2].checkpoint,
        makeL1PublishedData(999),
        first3[2].attestations,
      );
      // Also add checkpoint 4 (the next one) in the same batch
      await blockStore.addCheckpoints([cp3WithNewL1, publishedCheckpoints[3]]);

      // Checkpoint 3's L1 info should be updated
      const afterData = await blockStore.getCheckpointData(CheckpointNumber(3));
      expect(afterData).toBeDefined();
      expect(afterData!.l1.blockNumber).toEqual(999n);
      expect(afterData!.l1.blockNumber).not.toEqual(originalL1Block);

      // Checkpoint 4 should be stored
      expect(await blockStore.getLatestCheckpointNumber()).toEqual(CheckpointNumber(4));
    });

    it('accepts a batch that is entirely already-stored checkpoints', async () => {
      const first3 = publishedCheckpoints.slice(0, 3);
      await blockStore.addCheckpoints(first3);

      // Re-add the same 3 checkpoints — should succeed without error
      await expect(blockStore.addCheckpoints(first3)).resolves.toBe(true);
    });

    it('throws on duplicate checkpoints with mismatching archives', async () => {
      const first3 = publishedCheckpoints.slice(0, 3);
      await blockStore.addCheckpoints(first3);

      // Create a fake checkpoint 3 with a different archive root (content mismatch)
      const differentCheckpoint3 = await Checkpoint.random(CheckpointNumber(3), {
        numBlocks: 1,
        startBlockNumber: 3,
      });
      const mismatchedCp3 = makePublishedCheckpoint(differentCheckpoint3, 999);
      await expect(blockStore.addCheckpoints([mismatchedCp3])).rejects.toThrow(
        'already exists in store but with a different archive',
      );
    });

    it('throws an error if the previous block does not exist in the store', async () => {
      const checkpoint = await Checkpoint.random(CheckpointNumber(2), { numBlocks: 1, startBlockNumber: 2 });
      const block = makePublishedCheckpoint(checkpoint, 2);
      await expect(blockStore.addCheckpoints([block])).rejects.toThrow(InitialCheckpointNumberNotSequentialError);
      await expect(blockStore.getBlock({ number: BlockNumber(1) })).resolves.toBeUndefined();
    });

    it('throws an error if there is a gap in the blocks being added', async () => {
      const checkpoint1 = await Checkpoint.random(CheckpointNumber(1), { numBlocks: 1, startBlockNumber: 1 });
      const checkpoint3 = await Checkpoint.random(CheckpointNumber(3), { numBlocks: 1, startBlockNumber: 3 });
      const checkpoints = [makePublishedCheckpoint(checkpoint1, 1), makePublishedCheckpoint(checkpoint3, 3)];
      await expect(blockStore.addCheckpoints(checkpoints)).rejects.toThrow(CheckpointNumberNotSequentialError);
      await expect(blockStore.getBlock({ number: BlockNumber(1) })).resolves.toBeUndefined();
    });

    it('throws an error if blocks within a checkpoint are not sequential', async () => {
      // Create a checkpoint with non-sequential block numbers (block 1 and block 3, skipping block 2)
      const block1 = await L2Block.random(BlockNumber(1), { checkpointNumber: CheckpointNumber(1) });
      const block3 = await L2Block.random(BlockNumber(3), { checkpointNumber: CheckpointNumber(1) });

      const checkpoint = new Checkpoint(
        AppendOnlyTreeSnapshot.random(),
        CheckpointHeader.random(),
        [block1, block3],
        CheckpointNumber(1),
      );
      const publishedCheckpoint = makePublishedCheckpoint(checkpoint, 10);

      await expect(blockStore.addCheckpoints([publishedCheckpoint])).rejects.toThrow(BlockNumberNotSequentialError);
      await expect(blockStore.getBlock({ number: BlockNumber(1) })).resolves.toBeUndefined();
    });

    it('throws an error if blocks within a checkpoint do not have sequential indexes', async () => {
      // Create a checkpoint with non-sequential indexes
      const block1 = await L2Block.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
      });
      const block3 = await L2Block.random(BlockNumber(2), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(2),
      });

      const checkpoint = new Checkpoint(
        AppendOnlyTreeSnapshot.random(),
        CheckpointHeader.random(),
        [block1, block3],
        CheckpointNumber(1),
      );
      const publishedCheckpoint = makePublishedCheckpoint(checkpoint, 10);

      await expect(blockStore.addCheckpoints([publishedCheckpoint])).rejects.toThrow(BlockIndexNotSequentialError);
      await expect(blockStore.getBlock({ number: BlockNumber(1) })).resolves.toBeUndefined();
    });

    it('throws an error if blocks within a checkpoint do not start from index 0', async () => {
      // Create a checkpoint with non-sequential indexes
      const block1 = await L2Block.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(1),
      });
      const block3 = await L2Block.random(BlockNumber(2), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(2),
      });

      const checkpoint = new Checkpoint(
        AppendOnlyTreeSnapshot.random(),
        CheckpointHeader.random(),
        [block1, block3],
        CheckpointNumber(1),
      );
      const publishedCheckpoint = makePublishedCheckpoint(checkpoint, 10);

      await expect(blockStore.addCheckpoints([publishedCheckpoint])).rejects.toThrow(BlockIndexNotSequentialError);
      await expect(blockStore.getBlock({ number: BlockNumber(1) })).resolves.toBeUndefined();
    });

    it('throws an error if block has invalid checkpoint index', async () => {
      // Create a block wit an invalid checkpoint index
      const block1 = await L2Block.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: -1 as IndexWithinCheckpoint,
      });

      const checkpoint = new Checkpoint(
        AppendOnlyTreeSnapshot.random(),
        CheckpointHeader.random(),
        [block1],
        CheckpointNumber(1),
      );
      const publishedCheckpoint = makePublishedCheckpoint(checkpoint, 10);

      await expect(blockStore.addCheckpoints([publishedCheckpoint])).rejects.toThrow(BlockIndexNotSequentialError);
      await expect(blockStore.getBlock({ number: BlockNumber(1) })).resolves.toBeUndefined();
    });

    it('throws an error if checkpoint has invalid initial number', async () => {
      const block1 = await L2Block.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(2),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
      });

      const checkpoint = new Checkpoint(
        AppendOnlyTreeSnapshot.random(),
        CheckpointHeader.random(),
        [block1],
        CheckpointNumber(2),
      );
      const publishedCheckpoint = makePublishedCheckpoint(checkpoint, 10);

      await expect(blockStore.addCheckpoints([publishedCheckpoint])).rejects.toThrow(
        InitialCheckpointNumberNotSequentialError,
      );
    });

    it('allows the correct initial checkpoint', async () => {
      const block1 = await L2Block.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
      });

      const checkpoint = new Checkpoint(
        AppendOnlyTreeSnapshot.random(),
        CheckpointHeader.random(),
        [block1],
        CheckpointNumber(1),
      );
      const publishedCheckpoint = makePublishedCheckpoint(checkpoint, 10);

      await expect(blockStore.addCheckpoints([publishedCheckpoint])).resolves.toBe(true);
    });

    it('throws on duplicate checkpoint with different content', async () => {
      const block1 = await L2Block.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
      });

      const block2 = await L2Block.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
      });

      const checkpoint = new Checkpoint(
        AppendOnlyTreeSnapshot.random(),
        CheckpointHeader.random(),
        [block1],
        CheckpointNumber(1),
      );
      const publishedCheckpoint = makePublishedCheckpoint(checkpoint, 10);

      const checkpoint2 = new Checkpoint(
        AppendOnlyTreeSnapshot.random(),
        CheckpointHeader.random(),
        [block2],
        CheckpointNumber(1),
      );
      const publishedCheckpoint2 = makePublishedCheckpoint(checkpoint2, 10);

      await expect(blockStore.addCheckpoints([publishedCheckpoint])).resolves.toBe(true);
      await expect(blockStore.addCheckpoints([publishedCheckpoint2])).rejects.toThrow(
        'already exists in store but with a different archive',
      );
    });

    it('throws when crossing checkpoint boundary with non-zero index on first block', async () => {
      // Checkpoint 1: block 1
      const cp1 = await Checkpoint.random(CheckpointNumber(1), { numBlocks: 1, startBlockNumber: 1 });
      const cp1Published = makePublishedCheckpoint(cp1, 10);

      // Checkpoint 2: block 2 has indexWithinCheckpoint=1 (should be 0 for first block in new checkpoint)
      const block2 = await L2Block.random(BlockNumber(2), {
        checkpointNumber: CheckpointNumber(2),
        indexWithinCheckpoint: IndexWithinCheckpoint(1),
        lastArchive: cp1.blocks[0].archive,
      });
      const cp2 = new Checkpoint(
        AppendOnlyTreeSnapshot.random(),
        CheckpointHeader.random(),
        [block2],
        CheckpointNumber(2),
      );
      const cp2Published = makePublishedCheckpoint(cp2, 20);

      await expect(blockStore.addCheckpoints([cp1Published, cp2Published])).rejects.toThrow(
        BlockIndexNotSequentialError,
      );
    });

    it('accepts blocks that properly cross checkpoint boundaries', async () => {
      // Checkpoint 1: blocks 1-2, Checkpoint 2: blocks 3-4 — proper boundary crossing
      const genesisArchive = new AppendOnlyTreeSnapshot(new Fr(GENESIS_ARCHIVE_ROOT), 1);
      const checkpoints = await makeChainedCheckpoints(2, {
        previousArchive: genesisArchive,
        blocksPerCheckpoint: 2,
      });

      await expect(blockStore.addCheckpoints(checkpoints)).resolves.toBe(true);

      // Verify blocks have correct checkpoint assignments
      const block1 = await blockStore.getBlock({ number: BlockNumber(1) });
      const block2 = await blockStore.getBlock({ number: BlockNumber(2) });
      const block3 = await blockStore.getBlock({ number: BlockNumber(3) });
      const block4 = await blockStore.getBlock({ number: BlockNumber(4) });

      expect(block1!.checkpointNumber).toBe(1);
      expect(block2!.checkpointNumber).toBe(1);
      expect(block3!.checkpointNumber).toBe(2);
      expect(block4!.checkpointNumber).toBe(2);
    });
  });

  describe('removeCheckpointsAfter', () => {
    it('removing checkpoints will remove checkpoints from the chain', async () => {
      await blockStore.addCheckpoints(publishedCheckpoints);
      const checkpointNumber = await blockStore.getLatestCheckpointNumber();
      const lastCheckpoint = publishedCheckpoints.at(-1)!;
      const lastBlockNumber = lastCheckpoint.checkpoint.blocks[0].number;

      // Verify block exists before removing
      const retrievedBlock = await blockStore.getBlock({ number: BlockNumber(lastBlockNumber) });
      expect(retrievedBlock).toBeDefined();
      expect(retrievedBlock!.header.equals(lastCheckpoint.checkpoint.blocks[0].header)).toBe(true);
      expect(retrievedBlock!.checkpointNumber).toEqual(checkpointNumber);

      await blockStore.removeCheckpointsAfter(CheckpointNumber(checkpointNumber - 1));

      expect(await blockStore.getLatestCheckpointNumber()).toBe(checkpointNumber - 1);
      await expect(blockStore.getBlock({ number: BlockNumber(lastBlockNumber) })).resolves.toBeUndefined();
    });

    it('can remove multiple checkpoints', async () => {
      // Create checkpoints sequentially to chain archive roots
      const emptyCheckpoints: PublishedCheckpoint[] = [];
      for (let i = 0; i < 10; i++) {
        const previousArchive = i > 0 ? emptyCheckpoints[i - 1].checkpoint.blocks[0].archive : undefined;
        const checkpoint = await Checkpoint.random(CheckpointNumber(i + 1), {
          numBlocks: 1,
          startBlockNumber: i + 1,
          txsPerBlock: 0,
          previousArchive,
        });
        emptyCheckpoints.push(makePublishedCheckpoint(checkpoint, i + 10));
      }
      await blockStore.addCheckpoints(emptyCheckpoints);
      expect(await blockStore.getLatestCheckpointNumber()).toBe(10);

      await blockStore.removeCheckpointsAfter(CheckpointNumber(7));
      expect(await blockStore.getLatestCheckpointNumber()).toBe(7);
      expect((await blockStore.getRangeOfCheckpoints(CheckpointNumber(1), 10)).map(b => b.checkpointNumber)).toEqual([
        1, 2, 3, 4, 5, 6, 7,
      ]);
    });

    it('removed blocks and headers cannot be retrieved by hash or archive', async () => {
      await blockStore.addCheckpoints(publishedCheckpoints);
      const lastCheckpoint = publishedCheckpoints[publishedCheckpoints.length - 1];
      const lastBlock = lastCheckpoint.checkpoint.blocks[0];
      const blockHash = await lastBlock.header.hash();
      const archive = lastBlock.archive.root;

      // Verify block and header exist before removing
      const retrievedByHash = await blockStore.getBlock({ hash: blockHash });
      expect(retrievedByHash).toBeDefined();
      expect(retrievedByHash!.header.equals(lastBlock.header)).toBe(true);

      const retrievedByArchive = await blockStore.getBlock({ archive: archive });
      expect(retrievedByArchive).toBeDefined();
      expect(retrievedByArchive!.header.equals(lastBlock.header)).toBe(true);

      const headerByHash = (await blockStore.getBlockData({ hash: blockHash }))?.header;
      expect(headerByHash).toBeDefined();
      expect(headerByHash!.equals(lastBlock.header)).toBe(true);

      const headerByArchive = (await blockStore.getBlockData({ archive: archive }))?.header;
      expect(headerByArchive).toBeDefined();
      expect(headerByArchive!.equals(lastBlock.header)).toBe(true);

      // Remove the checkpoint
      await blockStore.removeCheckpointsAfter(CheckpointNumber(lastCheckpoint.checkpoint.number - 1));

      // Verify neither block nor header can be retrieved after removal
      expect(await blockStore.getBlock({ hash: blockHash })).toBeUndefined();
      expect(await blockStore.getBlock({ archive: archive })).toBeUndefined();
      expect(await blockStore.getBlockData({ hash: blockHash })).toBeUndefined();
      expect(await blockStore.getBlockData({ archive: archive })).toBeUndefined();
    });

    it('orphaned blocks are removed when removing checkpoints', async () => {
      // This test covers the scenario where:
      // 1. Checkpoint 1 is added (with block 1)
      // 2. Block 2 is added locally for upcoming checkpoint 2 (but checkpoint 2 doesn't exist yet)
      // 3. Checkpoint 1 is removed due to L1 reorg
      // 4. Block 2 should also be removed, even though it's not associated with any checkpoint entry

      // Add checkpoint 1 with block 1
      const checkpoint1Cp = await Checkpoint.random(CheckpointNumber(1), { numBlocks: 1, startBlockNumber: 1 });
      const checkpoint1 = makePublishedCheckpoint(checkpoint1Cp, 10);
      await blockStore.addCheckpoints([checkpoint1]);

      expect(await blockStore.getLatestCheckpointNumber()).toBe(1);
      expect(await blockStore.getLatestL2BlockNumber()).toBe(1);
      expect(await blockStore.getCheckpointedL2BlockNumber()).toBe(1);

      // Add block 2 locally for upcoming checkpoint 2 (no checkpoint entry yet)
      const lastBlockArchive = checkpoint1.checkpoint.blocks[0].archive;
      const block2 = await L2Block.random(BlockNumber(2), {
        checkpointNumber: CheckpointNumber(2),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        lastArchive: lastBlockArchive,
      });
      await blockStore.addProposedBlock(block2);

      // Verify state: checkpoint 1 exists, block 2 exists but is orphaned (no checkpoint 2)
      expect(await blockStore.getLatestCheckpointNumber()).toBe(1);
      expect(await blockStore.getLatestL2BlockNumber()).toBe(2);
      expect(await blockStore.getCheckpointedL2BlockNumber()).toBe(1);
      expect(await blockStore.getBlock({ number: BlockNumber(2) })).toBeDefined();

      // Remove checkpoint 1 (simulating L1 reorg)
      await blockStore.removeCheckpointsAfter(CheckpointNumber(0));

      // Verify that BOTH block 1 (from checkpoint) AND block 2 (orphaned) are removed
      expect(await blockStore.getLatestCheckpointNumber()).toBe(0);
      expect(await blockStore.getLatestL2BlockNumber()).toBe(0);
      expect(await blockStore.getCheckpointedL2BlockNumber()).toBe(0);
      expect(await blockStore.getBlock({ number: BlockNumber(1) })).toBeUndefined();
      expect(await blockStore.getBlock({ number: BlockNumber(2) })).toBeUndefined();
    });

    it('multiple orphaned blocks are removed when removing checkpoints', async () => {
      // Similar to above but with multiple orphaned blocks
      // Add checkpoint 1 with block 1
      const checkpoint1Cp = await Checkpoint.random(CheckpointNumber(1), { numBlocks: 1, startBlockNumber: 1 });
      const checkpoint1 = makePublishedCheckpoint(checkpoint1Cp, 10);
      await blockStore.addCheckpoints([checkpoint1]);

      // Add blocks 2, 3, 4 locally for upcoming checkpoint 2
      const lastBlockArchive = checkpoint1.checkpoint.blocks[0].archive;
      const block2 = await L2Block.random(BlockNumber(2), {
        checkpointNumber: CheckpointNumber(2),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        lastArchive: lastBlockArchive,
      });
      const block3 = await L2Block.random(BlockNumber(3), {
        checkpointNumber: CheckpointNumber(2),
        indexWithinCheckpoint: IndexWithinCheckpoint(1),
        lastArchive: block2.archive,
      });
      const block4 = await L2Block.random(BlockNumber(4), {
        checkpointNumber: CheckpointNumber(2),
        indexWithinCheckpoint: IndexWithinCheckpoint(2),
        lastArchive: block3.archive,
      });
      await addProposedBlocks(blockStore, [block2, block3, block4]);

      expect(await blockStore.getLatestCheckpointNumber()).toBe(1);
      expect(await blockStore.getLatestL2BlockNumber()).toBe(4);

      // Remove checkpoint 1
      await blockStore.removeCheckpointsAfter(CheckpointNumber(0));

      // All blocks should be removed
      expect(await blockStore.getLatestCheckpointNumber()).toBe(0);
      expect(await blockStore.getLatestL2BlockNumber()).toBe(0);
      for (let i = 1; i <= 4; i++) {
        expect(await blockStore.getBlock({ number: BlockNumber(i) })).toBeUndefined();
      }
    });
  });

  describe('multi-block checkpoints', () => {
    it('block number increases correctly when adding checkpoints with multiple blocks', async () => {
      // Create 3 checkpoints: first with 2 blocks, second with 3 blocks, third with 1 block
      // Total blocks: 6, spanning block numbers 1-6
      // Chain archive roots across checkpoints
      const checkpoint1Cp = await Checkpoint.random(CheckpointNumber(1), { numBlocks: 2, startBlockNumber: 1 });
      const checkpoint1 = makePublishedCheckpoint(checkpoint1Cp, 10);

      const previousArchive1 = checkpoint1Cp.blocks.at(-1)!.archive;
      const checkpoint2Cp = await Checkpoint.random(CheckpointNumber(2), {
        numBlocks: 3,
        startBlockNumber: 3,
        previousArchive: previousArchive1,
      });
      const checkpoint2 = makePublishedCheckpoint(checkpoint2Cp, 11);

      const previousArchive2 = checkpoint2Cp.blocks.at(-1)!.archive;
      const checkpoint3Cp = await Checkpoint.random(CheckpointNumber(3), {
        numBlocks: 1,
        startBlockNumber: 6,
        previousArchive: previousArchive2,
      });
      const checkpoint3 = makePublishedCheckpoint(checkpoint3Cp, 12);

      await blockStore.addCheckpoints([checkpoint1, checkpoint2, checkpoint3]);

      // Checkpoint number should be 3 (the last checkpoint number)
      expect(await blockStore.getLatestCheckpointNumber()).toBe(3);
      // Block number should be 6 (the last block number across all checkpoints)
      expect(await blockStore.getLatestL2BlockNumber()).toBe(6);
    });

    it('block number decreases correctly when unwinding checkpoints with multiple blocks', async () => {
      // Create 3 checkpoints with varying block counts, chaining archive roots
      const checkpoint1Cp = await Checkpoint.random(CheckpointNumber(1), { numBlocks: 2, startBlockNumber: 1 });
      const checkpoint1 = makePublishedCheckpoint(checkpoint1Cp, 10);

      const previousArchive1 = checkpoint1Cp.blocks.at(-1)!.archive;
      const checkpoint2Cp = await Checkpoint.random(CheckpointNumber(2), {
        numBlocks: 3,
        startBlockNumber: 3,
        previousArchive: previousArchive1,
      });
      const checkpoint2 = makePublishedCheckpoint(checkpoint2Cp, 11);

      const previousArchive2 = checkpoint2Cp.blocks.at(-1)!.archive;
      const checkpoint3Cp = await Checkpoint.random(CheckpointNumber(3), {
        numBlocks: 2,
        startBlockNumber: 6,
        previousArchive: previousArchive2,
      });
      const checkpoint3 = makePublishedCheckpoint(checkpoint3Cp, 12);

      await blockStore.addCheckpoints([checkpoint1, checkpoint2, checkpoint3]);

      expect(await blockStore.getLatestCheckpointNumber()).toBe(3);
      expect(await blockStore.getLatestL2BlockNumber()).toBe(7);

      // Remove the last checkpoint (which has 2 blocks)
      await blockStore.removeCheckpointsAfter(CheckpointNumber(2));

      expect(await blockStore.getLatestCheckpointNumber()).toBe(2);
      expect(await blockStore.getLatestL2BlockNumber()).toBe(5);

      // Remove another checkpoint (which has 3 blocks)
      await blockStore.removeCheckpointsAfter(CheckpointNumber(1));

      expect(await blockStore.getLatestCheckpointNumber()).toBe(1);
      expect(await blockStore.getLatestL2BlockNumber()).toBe(2);
    });

    it('removing multiple checkpoints with multiple blocks in one go', async () => {
      // Create 4 checkpoints with varying block counts, chaining archive roots
      // Checkpoint 1: blocks 1-2 (2 blocks)
      // Checkpoint 2: blocks 3-5 (3 blocks)
      // Checkpoint 3: blocks 6-7 (2 blocks)
      // Checkpoint 4: blocks 8-10 (3 blocks)
      // Total: 10 blocks across 4 checkpoints
      const checkpoint1Cp = await Checkpoint.random(CheckpointNumber(1), { numBlocks: 2, startBlockNumber: 1 });
      const checkpoint1 = makePublishedCheckpoint(checkpoint1Cp, 10);

      const previousArchive1 = checkpoint1Cp.blocks.at(-1)!.archive;
      const checkpoint2Cp = await Checkpoint.random(CheckpointNumber(2), {
        numBlocks: 3,
        startBlockNumber: 3,
        previousArchive: previousArchive1,
      });
      const checkpoint2 = makePublishedCheckpoint(checkpoint2Cp, 11);

      const previousArchive2 = checkpoint2Cp.blocks.at(-1)!.archive;
      const checkpoint3Cp = await Checkpoint.random(CheckpointNumber(3), {
        numBlocks: 2,
        startBlockNumber: 6,
        previousArchive: previousArchive2,
      });
      const checkpoint3 = makePublishedCheckpoint(checkpoint3Cp, 12);

      const previousArchive3 = checkpoint3Cp.blocks.at(-1)!.archive;
      const checkpoint4Cp = await Checkpoint.random(CheckpointNumber(4), {
        numBlocks: 3,
        startBlockNumber: 8,
        previousArchive: previousArchive3,
      });
      const checkpoint4 = makePublishedCheckpoint(checkpoint4Cp, 13);

      await blockStore.addCheckpoints([checkpoint1, checkpoint2, checkpoint3, checkpoint4]);

      expect(await blockStore.getLatestCheckpointNumber()).toBe(4);
      expect(await blockStore.getLatestL2BlockNumber()).toBe(10);

      // Remove checkpoints 3 and 4 (which together have 5 blocks)
      await blockStore.removeCheckpointsAfter(CheckpointNumber(2));

      expect(await blockStore.getLatestCheckpointNumber()).toBe(2);
      expect(await blockStore.getLatestL2BlockNumber()).toBe(5);

      // Verify blocks 1-5 still exist (from checkpoints 1 and 2)
      for (let blockNumber = 1; blockNumber <= 5; blockNumber++) {
        expect(await blockStore.getBlock({ number: BlockNumber(blockNumber) })).toBeDefined();
      }

      // Verify blocks 6-10 are gone (from checkpoints 3 and 4)
      for (let blockNumber = 6; blockNumber <= 10; blockNumber++) {
        expect(await blockStore.getBlock({ number: BlockNumber(blockNumber) })).toBeUndefined();
      }

      // Remove remaining checkpoints 1 and 2 (which together have 5 blocks)
      await blockStore.removeCheckpointsAfter(CheckpointNumber(0));

      expect(await blockStore.getLatestCheckpointNumber()).toBe(0);
      expect(await blockStore.getLatestL2BlockNumber()).toBe(0);

      // Verify all blocks are gone
      for (let blockNumber = 1; blockNumber <= 10; blockNumber++) {
        expect(await blockStore.getBlock({ number: BlockNumber(blockNumber) })).toBeUndefined();
      }
    });

    it('getCheckpointedBlock returns correct checkpoint info for blocks within multi-block checkpoints', async () => {
      // Create checkpoints with chained archive roots
      // Create a checkpoint with 3 blocks
      const checkpoint1Cp = await Checkpoint.random(CheckpointNumber(1), { numBlocks: 3, startBlockNumber: 1 });
      const checkpoint1 = makePublishedCheckpoint(checkpoint1Cp, 10);

      // Create another checkpoint with 2 blocks
      const previousArchive1 = checkpoint1Cp.blocks.at(-1)!.archive;
      const checkpoint2Cp = await Checkpoint.random(CheckpointNumber(2), {
        numBlocks: 2,
        startBlockNumber: 4,
        previousArchive: previousArchive1,
      });
      const checkpoint2 = makePublishedCheckpoint(checkpoint2Cp, 11);

      await blockStore.addCheckpoints([checkpoint1, checkpoint2]);

      // Check blocks from the first checkpoint (blocks 1, 2, 3)
      for (let i = 0; i < 3; i++) {
        const blockNumber = i + 1;
        const retrievedBlock = await blockStore.getBlock({ number: BlockNumber(blockNumber) });

        expect(retrievedBlock).toBeDefined();
        expect(retrievedBlock!.checkpointNumber).toBe(1);
        expect(retrievedBlock!.number).toBe(blockNumber);
        const checkpointData1 = await blockStore.getCheckpointData(retrievedBlock!.checkpointNumber);
        expect(checkpointData1?.l1).toEqual(checkpoint1.l1);
        expect(checkpointData1?.attestations.every((a, j) => a.equals(checkpoint1.attestations[j]))).toBe(true);
      }

      // Check blocks from the second checkpoint (blocks 4, 5)
      for (let i = 0; i < 2; i++) {
        const blockNumber = i + 4;
        const retrievedBlock = await blockStore.getBlock({ number: BlockNumber(blockNumber) });

        expect(retrievedBlock).toBeDefined();
        expect(retrievedBlock!.checkpointNumber).toBe(2);
        expect(retrievedBlock!.number).toBe(blockNumber);
        const checkpointData2 = await blockStore.getCheckpointData(retrievedBlock!.checkpointNumber);
        expect(checkpointData2?.l1).toEqual(checkpoint2.l1);
        expect(checkpointData2?.attestations.every((a, j) => a.equals(checkpoint2.attestations[j]))).toBe(true);
      }
    });

    it('getCheckpointedBlockByHash returns correct checkpoint info for blocks within multi-block checkpoints', async () => {
      const checkpoint = makePublishedCheckpoint(
        await Checkpoint.random(CheckpointNumber(1), { numBlocks: 3, startBlockNumber: 1 }),
        10,
      );

      await blockStore.addCheckpoints([checkpoint]);

      // Check each block by its hash
      for (let i = 0; i < checkpoint.checkpoint.blocks.length; i++) {
        const block = checkpoint.checkpoint.blocks[i];
        const blockHash = await block.header.hash();
        const retrievedBlock = await blockStore.getBlock({ hash: blockHash });

        expect(retrievedBlock).toBeDefined();
        expect(retrievedBlock!.checkpointNumber).toBe(1);
        expect(retrievedBlock!.number).toBe(i + 1);
        const checkpointData = await blockStore.getCheckpointData(retrievedBlock!.checkpointNumber);
        expect(checkpointData?.l1).toEqual(checkpoint.l1);
      }
    });

    it('getCheckpointedBlockByArchive returns correct checkpoint info for blocks within multi-block checkpoints', async () => {
      const checkpoint = makePublishedCheckpoint(
        await Checkpoint.random(CheckpointNumber(1), { numBlocks: 3, startBlockNumber: 1 }),
        10,
      );

      await blockStore.addCheckpoints([checkpoint]);

      // Check each block by its archive root
      for (let i = 0; i < checkpoint.checkpoint.blocks.length; i++) {
        const block = checkpoint.checkpoint.blocks[i];
        const archive = block.archive.root;
        const retrievedBlock = await blockStore.getBlock({ archive: archive });

        expect(retrievedBlock).toBeDefined();
        expect(retrievedBlock!.checkpointNumber).toBe(1);
        expect(retrievedBlock!.number).toBe(i + 1);
        const checkpointData = await blockStore.getCheckpointData(retrievedBlock!.checkpointNumber);
        expect(checkpointData?.l1).toEqual(checkpoint.l1);
      }
    });

    it('removing a multi-block checkpoint removes all its blocks', async () => {
      const checkpoint = makePublishedCheckpoint(
        await Checkpoint.random(CheckpointNumber(1), { numBlocks: 3, startBlockNumber: 1 }),
        10,
      );

      await blockStore.addCheckpoints([checkpoint]);

      // Verify all 3 blocks exist
      for (let blockNumber = 1; blockNumber <= 3; blockNumber++) {
        expect(await blockStore.getBlock({ number: BlockNumber(blockNumber) })).toBeDefined();
      }

      // Remove the checkpoint
      await blockStore.removeCheckpointsAfter(CheckpointNumber(0));

      // Verify all 3 blocks are removed
      for (let blockNumber = 1; blockNumber <= 3; blockNumber++) {
        expect(await blockStore.getBlock({ number: BlockNumber(blockNumber) })).toBeUndefined();
      }

      expect(await blockStore.getLatestCheckpointNumber()).toBe(0);
      expect(await blockStore.getLatestL2BlockNumber()).toBe(0);
    });
  });

  describe('uncheckpointed blocks', () => {
    it('can add blocks independently before a checkpoint arrives', async () => {
      // First, establish some checkpointed blocks (checkpoint 1 with blocks 1-3)
      const checkpoint1 = makePublishedCheckpoint(
        await Checkpoint.random(CheckpointNumber(1), { numBlocks: 3, startBlockNumber: 1 }),
        10,
      );
      await blockStore.addCheckpoints([checkpoint1]);

      expect(await blockStore.getLatestCheckpointNumber()).toBe(1);
      expect(await blockStore.getLatestL2BlockNumber()).toBe(3);

      // Now add blocks 4, 5, 6 independently (without a checkpoint) for upcoming checkpoint 2
      // Chain archive roots from the last block of checkpoint 1
      const lastBlockArchive = checkpoint1.checkpoint.blocks.at(-1)!.archive;
      const block4 = await L2Block.random(BlockNumber(4), {
        checkpointNumber: CheckpointNumber(2),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        lastArchive: lastBlockArchive,
      });
      const block5 = await L2Block.random(BlockNumber(5), {
        checkpointNumber: CheckpointNumber(2),
        indexWithinCheckpoint: IndexWithinCheckpoint(1),
        lastArchive: block4.archive,
      });
      const block6 = await L2Block.random(BlockNumber(6), {
        checkpointNumber: CheckpointNumber(2),
        indexWithinCheckpoint: IndexWithinCheckpoint(2),
        lastArchive: block5.archive,
      });

      await addProposedBlocks(blockStore, [block4, block5, block6]);

      // Checkpoint number should still be 1 (no new checkpoint added)
      expect(await blockStore.getLatestCheckpointNumber()).toBe(1);
      // But latest block number should be 6
      expect(await blockStore.getLatestL2BlockNumber()).toBe(6);
    });

    it('getBlock retrieves uncheckpointed blocks', async () => {
      // First, establish some checkpointed blocks
      const checkpoint1 = makePublishedCheckpoint(
        await Checkpoint.random(CheckpointNumber(1), { numBlocks: 2, startBlockNumber: 1 }),
        10,
      );
      await blockStore.addCheckpoints([checkpoint1]);

      // Add uncheckpointed blocks for upcoming checkpoint 2, chaining archive roots
      const lastBlockArchive = checkpoint1.checkpoint.blocks.at(-1)!.archive;
      const block3 = await L2Block.random(BlockNumber(3), {
        checkpointNumber: CheckpointNumber(2),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        lastArchive: lastBlockArchive,
      });
      const block4 = await L2Block.random(BlockNumber(4), {
        checkpointNumber: CheckpointNumber(2),
        indexWithinCheckpoint: IndexWithinCheckpoint(1),
        lastArchive: block3.archive,
      });
      await addProposedBlocks(blockStore, [block3, block4]);

      // getBlock should work for both checkpointed and uncheckpointed blocks
      expect((await blockStore.getBlock({ number: BlockNumber(1) }))?.number).toBe(1);
      expect((await blockStore.getBlock({ number: BlockNumber(2) }))?.number).toBe(2);
      expect((await blockStore.getBlock({ number: BlockNumber(3) }))?.equals(block3)).toBe(true);
      expect((await blockStore.getBlock({ number: BlockNumber(4) }))?.equals(block4)).toBe(true);
      expect(await blockStore.getBlock({ number: BlockNumber(5) })).toBeUndefined();

      const block5 = await L2Block.random(BlockNumber(5), {
        checkpointNumber: CheckpointNumber(2),
        indexWithinCheckpoint: IndexWithinCheckpoint(2),
        lastArchive: block4.archive,
      });
      await blockStore.addProposedBlock(block5);

      // Verify the uncheckpointed blocks have correct data
      const retrieved3 = await blockStore.getBlock({ number: BlockNumber(3) });
      expect(retrieved3!.number).toBe(3);
      expect(retrieved3!.equals(block3)).toBe(true);
      const retrieved4 = await blockStore.getBlock({ number: BlockNumber(4) });
      expect(retrieved4!.number).toBe(4);
      expect(retrieved4!.equals(block4)).toBe(true);
      const retrieved5 = await blockStore.getBlock({ number: BlockNumber(5) });
      expect(retrieved5!.number).toBe(5);
      expect(retrieved5!.equals(block5)).toBe(true);
    });

    it('getBlockByHash retrieves uncheckpointed blocks', async () => {
      // Add uncheckpointed blocks (no checkpoints at all) for initial checkpoint 1, chaining archive roots
      const block1 = await L2Block.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
      });
      const block2 = await L2Block.random(BlockNumber(2), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(1),
        lastArchive: block1.archive,
      });
      await addProposedBlocks(blockStore, [block1, block2]);

      // getBlockByHash should work for uncheckpointed blocks
      const hash1 = await block1.header.hash();
      const hash2 = await block2.header.hash();

      const retrieved1 = await blockStore.getBlock({ hash: hash1 });
      expect(retrieved1!.equals(block1)).toBe(true);

      const retrieved2 = await blockStore.getBlock({ hash: hash2 });
      expect(retrieved2!.equals(block2)).toBe(true);
    });

    it('getBlockByArchive retrieves uncheckpointed blocks', async () => {
      // Add uncheckpointed blocks for initial checkpoint 1, chaining archive roots
      const block1 = await L2Block.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
      });
      const block2 = await L2Block.random(BlockNumber(2), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(1),
        lastArchive: block1.archive,
      });
      await addProposedBlocks(blockStore, [block1, block2]);

      // getBlockByArchive should work for uncheckpointed blocks
      const archive1 = block1.archive.root;
      const archive2 = block2.archive.root;

      const retrieved1 = await blockStore.getBlock({ archive: archive1 });
      expect(retrieved1!.equals(block1)).toBe(true);

      const retrieved2 = await blockStore.getBlock({ archive: archive2 });
      expect(retrieved2!.equals(block2)).toBe(true);
    });

    it('checkpoint adopts previously added uncheckpointed blocks', async () => {
      // Add blocks 1-3 without a checkpoint (for initial checkpoint 1), chaining archive roots
      const block1 = await L2Block.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
      });
      const block2 = await L2Block.random(BlockNumber(2), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(1),
        lastArchive: block1.archive,
      });
      const block3 = await L2Block.random(BlockNumber(3), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(2),
        lastArchive: block2.archive,
      });
      await addProposedBlocks(blockStore, [block1, block2, block3]);

      expect(await blockStore.getLatestCheckpointNumber()).toBe(0);
      expect(await blockStore.getLatestL2BlockNumber()).toBe(3);

      // Now add a checkpoint that covers blocks 1-3
      const checkpoint1 = makePublishedCheckpoint(
        await Checkpoint.random(CheckpointNumber(1), { numBlocks: 3, startBlockNumber: 1 }),
        10,
      );
      await blockStore.addCheckpoints([checkpoint1]);

      expect(await blockStore.getLatestCheckpointNumber()).toBe(1);
      expect(await blockStore.getLatestL2BlockNumber()).toBe(3);

      // Now getBlock should return all blocks
      const checkpointed1 = await blockStore.getBlock({ number: BlockNumber(1) });
      expect(checkpointed1).toBeDefined();
      expect(checkpointed1!.checkpointNumber).toBe(1);
      const checkpointData1 = await blockStore.getCheckpointData(checkpointed1!.checkpointNumber);
      expect(checkpointData1?.l1).toEqual(checkpoint1.l1);

      const checkpointed2 = await blockStore.getBlock({ number: BlockNumber(2) });
      expect(checkpointed2).toBeDefined();
      expect(checkpointed2!.checkpointNumber).toBe(1);

      const checkpointed3 = await blockStore.getBlock({ number: BlockNumber(3) });
      expect(checkpointed3).toBeDefined();
      expect(checkpointed3!.checkpointNumber).toBe(1);
    });

    it('can add more uncheckpointed blocks after a checkpoint and then checkpoint them', async () => {
      // Start with checkpoint 1 covering blocks 1-2
      const checkpoint1 = makePublishedCheckpoint(
        await Checkpoint.random(CheckpointNumber(1), { numBlocks: 2, startBlockNumber: 1 }),
        10,
      );
      await blockStore.addCheckpoints([checkpoint1]);

      // Add uncheckpointed blocks 3-5 for the upcoming checkpoint 2, chaining archive roots
      const lastBlockArchive = checkpoint1.checkpoint.blocks.at(-1)!.archive;
      const block3 = await L2Block.random(BlockNumber(3), {
        checkpointNumber: CheckpointNumber(2),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        lastArchive: lastBlockArchive,
      });
      const block4 = await L2Block.random(BlockNumber(4), {
        checkpointNumber: CheckpointNumber(2),
        indexWithinCheckpoint: IndexWithinCheckpoint(1),
        lastArchive: block3.archive,
      });
      const block5 = await L2Block.random(BlockNumber(5), {
        checkpointNumber: CheckpointNumber(2),
        indexWithinCheckpoint: IndexWithinCheckpoint(2),
        lastArchive: block4.archive,
      });
      await addProposedBlocks(blockStore, [block3, block4, block5]);

      expect(await blockStore.getLatestCheckpointNumber()).toBe(1);
      expect(await blockStore.getLatestL2BlockNumber()).toBe(5);

      // Add checkpoint 2 covering blocks 3-5, chaining from checkpoint1
      const checkpoint2 = makePublishedCheckpoint(
        await Checkpoint.random(CheckpointNumber(2), {
          numBlocks: 3,
          startBlockNumber: 3,
          previousArchive: lastBlockArchive,
        }),
        11,
      );
      await blockStore.addCheckpoints([checkpoint2]);

      expect(await blockStore.getLatestCheckpointNumber()).toBe(2);
      expect(await blockStore.getLatestL2BlockNumber()).toBe(5);

      // Now blocks 3-5 should be checkpointed with checkpoint 2's info
      const checkpointed3 = await blockStore.getBlock({ number: BlockNumber(3) });
      expect(checkpointed3).toBeDefined();
      expect(checkpointed3!.checkpointNumber).toBe(2);
      const checkpointData2 = await blockStore.getCheckpointData(checkpointed3!.checkpointNumber);
      expect(checkpointData2?.l1).toEqual(checkpoint2.l1);

      const checkpointed4 = await blockStore.getBlock({ number: BlockNumber(4) });
      expect(checkpointed4).toBeDefined();
      expect(checkpointed4!.checkpointNumber).toBe(2);

      const checkpointed5 = await blockStore.getBlock({ number: BlockNumber(5) });
      expect(checkpointed5).toBeDefined();
      expect(checkpointed5!.checkpointNumber).toBe(2);
    });

    it('getBlocks retrieves both checkpointed and uncheckpointed blocks', async () => {
      // Add checkpoint with blocks 1-2
      const checkpoint1 = makePublishedCheckpoint(
        await Checkpoint.random(CheckpointNumber(1), { numBlocks: 2, startBlockNumber: 1 }),
        10,
      );
      await blockStore.addCheckpoints([checkpoint1]);

      // Add uncheckpointed blocks 3-4 for the upcoming checkpoint 2, chaining archive roots
      const lastBlockArchive = checkpoint1.checkpoint.blocks.at(-1)!.archive;
      const block3 = await L2Block.random(BlockNumber(3), {
        checkpointNumber: CheckpointNumber(2),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        lastArchive: lastBlockArchive,
      });
      const block4 = await L2Block.random(BlockNumber(4), {
        checkpointNumber: CheckpointNumber(2),
        indexWithinCheckpoint: IndexWithinCheckpoint(1),
        lastArchive: block3.archive,
      });
      await addProposedBlocks(blockStore, [block3, block4]);

      // getBlocks should retrieve all blocks
      const allBlocks = await blockStore.getBlocks({ from: BlockNumber(1), limit: 10 });
      expect(allBlocks.length).toBe(4);
      expect(allBlocks.map(b => b.number)).toEqual([1, 2, 3, 4]);
    });
  });

  describe('addProposedBlock validation', () => {
    it('throws if checkpoint number is not the current checkpoint', async () => {
      // First, establish checkpoint 1 with blocks 1-2
      const checkpoint1 = makePublishedCheckpoint(
        await Checkpoint.random(CheckpointNumber(1), { numBlocks: 2, startBlockNumber: 1 }),
        10,
      );
      await blockStore.addCheckpoints([checkpoint1]);

      // Try to add a block for checkpoint 3 (skipping checkpoint 2)
      const block3 = await L2Block.random(BlockNumber(3), {
        checkpointNumber: CheckpointNumber(3),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
      });

      await expect(blockStore.addProposedBlock(block3)).rejects.toThrow(BlockCheckpointNumberNotSequentialError);
    });

    it('allows blocks with the same checkpoint number for the current checkpoint', async () => {
      // First, establish checkpoint 1 with blocks 1-2
      const checkpoint1 = makePublishedCheckpoint(
        await Checkpoint.random(CheckpointNumber(1), { numBlocks: 2, startBlockNumber: 1 }),
        10,
      );
      await blockStore.addCheckpoints([checkpoint1]);

      // Add blocks 3 and 4 with consistent checkpoint number (2), chaining archive roots
      const lastBlockArchive = checkpoint1.checkpoint.blocks.at(-1)!.archive;
      const block3 = await L2Block.random(BlockNumber(3), {
        checkpointNumber: CheckpointNumber(2),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        lastArchive: lastBlockArchive,
      });
      const block4 = await L2Block.random(BlockNumber(4), {
        checkpointNumber: CheckpointNumber(2),
        indexWithinCheckpoint: IndexWithinCheckpoint(1),
        lastArchive: block3.archive,
      });

      await expect(addProposedBlocks(blockStore, [block3, block4])).resolves.toBe(true);

      // Verify blocks were added
      expect((await blockStore.getBlock({ number: BlockNumber(3) }))?.equals(block3)).toBe(true);
      expect((await blockStore.getBlock({ number: BlockNumber(4) }))?.equals(block4)).toBe(true);
    });

    it('allows blocks for the initial checkpoint when store is empty', async () => {
      // Add blocks for the initial checkpoint (1), chaining archive roots
      const block1 = await L2Block.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
      });
      const block2 = await L2Block.random(BlockNumber(2), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(1),
        lastArchive: block1.archive,
      });

      await expect(addProposedBlocks(blockStore, [block1, block2])).resolves.toBe(true);

      // Verify blocks were added
      expect((await blockStore.getBlock({ number: BlockNumber(1) }))?.equals(block1)).toBe(true);
      expect((await blockStore.getBlock({ number: BlockNumber(2) }))?.equals(block2)).toBe(true);
      expect(await blockStore.getLatestL2BlockNumber()).toBe(2);
    });

    it('throws if initial block is duplicated across calls', async () => {
      // Add blocks for the initial checkpoint (1)
      const block1 = await L2Block.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
      });
      const block2 = await L2Block.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
      });

      await expect(blockStore.addProposedBlock(block1)).resolves.toBe(true);
      await expect(blockStore.addProposedBlock(block2)).rejects.toThrow(BlockNumberNotSequentialError);
    });

    it('throws if first block has wrong checkpoint number when store is empty', async () => {
      // Try to add a block for checkpoint 2 when store is empty (should start at 1)
      const block1 = await L2Block.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(2),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
      });

      await expect(blockStore.addProposedBlock(block1)).rejects.toThrow(BlockCheckpointNumberNotSequentialError);
    });

    it('allows adding more blocks to the same checkpoint in separate calls', async () => {
      // First, establish checkpoint 1 with blocks 1-2
      const checkpoint1 = makePublishedCheckpoint(
        await Checkpoint.random(CheckpointNumber(1), { numBlocks: 2, startBlockNumber: 1 }),
        10,
      );
      await blockStore.addCheckpoints([checkpoint1]);

      // Add block 3 for checkpoint 2, chaining archive roots
      const lastBlockArchive = checkpoint1.checkpoint.blocks.at(-1)!.archive;
      const block3 = await L2Block.random(BlockNumber(3), {
        checkpointNumber: CheckpointNumber(2),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        lastArchive: lastBlockArchive,
      });
      await expect(blockStore.addProposedBlock(block3)).resolves.toBe(true);

      // Add block 4 for the same checkpoint 2 in a separate call
      const block4 = await L2Block.random(BlockNumber(4), {
        checkpointNumber: CheckpointNumber(2),
        indexWithinCheckpoint: IndexWithinCheckpoint(1),
        lastArchive: block3.archive,
      });
      await expect(blockStore.addProposedBlock(block4)).resolves.toBe(true);

      expect(await blockStore.getLatestL2BlockNumber()).toBe(4);
    });

    it('throws if adding blocks in separate calls with non-consecutive indexes', async () => {
      // First, establish checkpoint 1 with blocks 1-2
      const checkpoint1 = makePublishedCheckpoint(
        await Checkpoint.random(CheckpointNumber(1), { numBlocks: 2, startBlockNumber: 1 }),
        10,
      );
      await blockStore.addCheckpoints([checkpoint1]);

      // Add block 3 for checkpoint 2, chaining archive roots
      const lastBlockArchive = checkpoint1.checkpoint.blocks.at(-1)!.archive;
      const block3 = await L2Block.random(BlockNumber(3), {
        checkpointNumber: CheckpointNumber(2),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        lastArchive: lastBlockArchive,
      });
      await expect(blockStore.addProposedBlock(block3)).resolves.toBe(true);

      // Add block 4 for the same checkpoint 2 in a separate call but with a missing index
      const block4 = await L2Block.random(BlockNumber(4), {
        checkpointNumber: CheckpointNumber(2),
        indexWithinCheckpoint: IndexWithinCheckpoint(2),
        lastArchive: block3.archive,
      });
      await expect(blockStore.addProposedBlock(block4)).rejects.toThrow(BlockIndexNotSequentialError);

      expect(await blockStore.getLatestL2BlockNumber()).toBe(3);
    });

    it('throws if second batch of blocks has different checkpoint number than first batch', async () => {
      // First, establish checkpoint 1 with blocks 1-2
      const checkpoint1 = makePublishedCheckpoint(
        await Checkpoint.random(CheckpointNumber(1), { numBlocks: 2, startBlockNumber: 1 }),
        10,
      );
      await blockStore.addCheckpoints([checkpoint1]);

      // Add block 3 for checkpoint 2, chaining archive roots
      const lastBlockArchive = checkpoint1.checkpoint.blocks.at(-1)!.archive;
      const block3 = await L2Block.random(BlockNumber(3), {
        checkpointNumber: CheckpointNumber(2),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        lastArchive: lastBlockArchive,
      });
      await blockStore.addProposedBlock(block3);

      // Try to add block 4 for checkpoint 3 (should fail because current checkpoint is still 2)
      const block4 = await L2Block.random(BlockNumber(4), {
        checkpointNumber: CheckpointNumber(3),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        lastArchive: block3.archive,
      });
      await expect(blockStore.addProposedBlock(block4)).rejects.toThrow(BlockCheckpointNumberNotSequentialError);
    });

    it('force option bypasses checkpoint number validation', async () => {
      // First, establish checkpoint 1 with blocks 1-2
      const checkpoint1 = makePublishedCheckpoint(
        await Checkpoint.random(CheckpointNumber(1), { numBlocks: 2, startBlockNumber: 1 }),
        10,
      );
      await blockStore.addCheckpoints([checkpoint1]);

      // Add blocks with different checkpoint numbers using force option, chaining archive roots
      const lastBlockArchive = checkpoint1.checkpoint.blocks.at(-1)!.archive;
      const block3 = await L2Block.random(BlockNumber(3), {
        checkpointNumber: CheckpointNumber(2),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        lastArchive: lastBlockArchive,
      });
      const block4 = await L2Block.random(BlockNumber(4), {
        checkpointNumber: CheckpointNumber(5),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        lastArchive: block3.archive,
      });

      await expect(addProposedBlocks(blockStore, [block3, block4], { force: true })).resolves.toBe(true);
    });

    it('force option bypasses blockindex number validation', async () => {
      // First, establish checkpoint 1 with blocks 1-2
      const checkpoint1 = makePublishedCheckpoint(
        await Checkpoint.random(CheckpointNumber(1), { numBlocks: 2, startBlockNumber: 1 }),
        10,
      );
      await blockStore.addCheckpoints([checkpoint1]);

      // Add blocks with different checkpoint numbers using force option, chaining archive roots
      const lastBlockArchive = checkpoint1.checkpoint.blocks.at(-1)!.archive;
      const block3 = await L2Block.random(BlockNumber(3), {
        checkpointNumber: CheckpointNumber(2),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        lastArchive: lastBlockArchive,
      });
      const block4 = await L2Block.random(BlockNumber(4), {
        checkpointNumber: CheckpointNumber(2),
        indexWithinCheckpoint: IndexWithinCheckpoint(2),
        lastArchive: block3.archive,
      });

      await expect(addProposedBlocks(blockStore, [block3, block4], { force: true })).resolves.toBe(true);
    });

    it('throws if adding blocks with non-consecutive archives', async () => {
      // First, establish checkpoint 1 with blocks 1-2
      const checkpoint1 = makePublishedCheckpoint(
        await Checkpoint.random(CheckpointNumber(1), { numBlocks: 2, startBlockNumber: 1 }),
        10,
      );
      await blockStore.addCheckpoints([checkpoint1]);

      // Add block 3 for checkpoint 2 with incorrect archive
      const block3 = await L2Block.random(BlockNumber(3), {
        checkpointNumber: CheckpointNumber(2),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
      });
      await expect(blockStore.addProposedBlock(block3)).rejects.toThrow(BlockArchiveNotConsistentError);

      expect(await blockStore.getLatestL2BlockNumber()).toBe(2);
    });

    it('throws if adding blocks with non-consecutive archives across calls', async () => {
      // First, establish checkpoint 1 with blocks 1-2
      const checkpoint1 = makePublishedCheckpoint(
        await Checkpoint.random(CheckpointNumber(1), { numBlocks: 2, startBlockNumber: 1 }),
        10,
      );
      await blockStore.addCheckpoints([checkpoint1]);

      // Add block 3 for checkpoint 2 with correct archive
      const lastBlockArchive = checkpoint1.checkpoint.blocks.at(-1)!.archive;
      const block3 = await L2Block.random(BlockNumber(3), {
        checkpointNumber: CheckpointNumber(2),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        lastArchive: lastBlockArchive,
      });
      await expect(blockStore.addProposedBlock(block3)).resolves.toBe(true);

      // Add block 4 with incorrect archive (should fail)
      const block4 = await L2Block.random(BlockNumber(4), {
        checkpointNumber: CheckpointNumber(2),
        indexWithinCheckpoint: IndexWithinCheckpoint(1),
        lastArchive: AppendOnlyTreeSnapshot.random(),
      });
      await expect(blockStore.addProposedBlock(block4)).rejects.toThrow(BlockArchiveNotConsistentError);

      expect(await blockStore.getLatestL2BlockNumber()).toBe(3);
    });

    it('throws if adding blocks that would overwrite checkpointed blocks', async () => {
      // First, establish checkpoint 1 with blocks 1-2
      const checkpoint1 = makePublishedCheckpoint(
        await Checkpoint.random(CheckpointNumber(1), { numBlocks: 2, startBlockNumber: 1 }),
        10,
      );
      await blockStore.addCheckpoints([checkpoint1]);

      expect(await blockStore.getCheckpointedL2BlockNumber()).toBe(2);

      // Try to add a block that would overwrite checkpointed block 2
      const block2 = await L2Block.random(BlockNumber(2), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(1),
      });
      await expect(blockStore.addProposedBlock(block2)).rejects.toThrow(CannotOverwriteCheckpointedBlockError);

      // Try to add a block that would overwrite checkpointed block 1
      const block1 = await L2Block.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
      });
      await expect(blockStore.addProposedBlock(block1)).rejects.toThrow(CannotOverwriteCheckpointedBlockError);
    });

    it('throws BlockAlreadyCheckpointedError if proposed block matches the checkpointed one', async () => {
      const checkpoint1 = makePublishedCheckpoint(
        await Checkpoint.random(CheckpointNumber(1), { numBlocks: 2, startBlockNumber: 1 }),
        10,
      );
      await blockStore.addCheckpoints([checkpoint1]);

      // Re-propose the same block that was already checkpointed
      const checkpointedBlock = checkpoint1.checkpoint.blocks[1];
      await expect(blockStore.addProposedBlock(checkpointedBlock)).rejects.toThrow(BlockAlreadyCheckpointedError);
    });
  });

  describe('getBlocksForCheckpoint', () => {
    it('returns blocks for a single-block checkpoint', async () => {
      const checkpoint = makePublishedCheckpoint(
        await Checkpoint.random(CheckpointNumber(1), { numBlocks: 1, startBlockNumber: 1 }),
        10,
      );
      await blockStore.addCheckpoints([checkpoint]);

      const blocks = await blockStore.getBlocksForCheckpoint(CheckpointNumber(1));
      expect(blocks).toBeDefined();
      expect(blocks!.length).toBe(1);
      expect(blocks![0].number).toBe(1);
    });

    it('returns all blocks for a multi-block checkpoint', async () => {
      const checkpoint = makePublishedCheckpoint(
        await Checkpoint.random(CheckpointNumber(1), { numBlocks: 4, startBlockNumber: 1 }),
        10,
      );
      await blockStore.addCheckpoints([checkpoint]);

      const blocks = await blockStore.getBlocksForCheckpoint(CheckpointNumber(1));
      expect(blocks).toBeDefined();
      expect(blocks!.length).toBe(4);
      expect(blocks!.map(b => b.number)).toEqual([1, 2, 3, 4]);
    });

    it('returns correct blocks for different checkpoints', async () => {
      // Create checkpoints with chained archive roots
      // Checkpoint 1: blocks 1-2
      const checkpoint1Cp = await Checkpoint.random(CheckpointNumber(1), { numBlocks: 2, startBlockNumber: 1 });
      const checkpoint1 = makePublishedCheckpoint(checkpoint1Cp, 10);

      // Checkpoint 2: blocks 3-5
      const previousArchive1 = checkpoint1Cp.blocks.at(-1)!.archive;
      const checkpoint2Cp = await Checkpoint.random(CheckpointNumber(2), {
        numBlocks: 3,
        startBlockNumber: 3,
        previousArchive: previousArchive1,
      });
      const checkpoint2 = makePublishedCheckpoint(checkpoint2Cp, 11);

      // Checkpoint 3: blocks 6-7
      const previousArchive2 = checkpoint2Cp.blocks.at(-1)!.archive;
      const checkpoint3Cp = await Checkpoint.random(CheckpointNumber(3), {
        numBlocks: 2,
        startBlockNumber: 6,
        previousArchive: previousArchive2,
      });
      const checkpoint3 = makePublishedCheckpoint(checkpoint3Cp, 12);

      await blockStore.addCheckpoints([checkpoint1, checkpoint2, checkpoint3]);

      const blocks1 = await blockStore.getBlocksForCheckpoint(CheckpointNumber(1));
      expect(blocks1).toBeDefined();
      expect(blocks1!.map(b => b.number)).toEqual([1, 2]);

      const blocks2 = await blockStore.getBlocksForCheckpoint(CheckpointNumber(2));
      expect(blocks2).toBeDefined();
      expect(blocks2!.map(b => b.number)).toEqual([3, 4, 5]);

      const blocks3 = await blockStore.getBlocksForCheckpoint(CheckpointNumber(3));
      expect(blocks3).toBeDefined();
      expect(blocks3!.map(b => b.number)).toEqual([6, 7]);
    });

    it('returns undefined for non-existent checkpoint', async () => {
      const checkpoint = makePublishedCheckpoint(
        await Checkpoint.random(CheckpointNumber(1), { numBlocks: 2, startBlockNumber: 1 }),
        10,
      );
      await blockStore.addCheckpoints([checkpoint]);

      const blocks = await blockStore.getBlocksForCheckpoint(CheckpointNumber(5));
      expect(blocks).toBeUndefined();
    });

    it('returns undefined when no checkpoints exist', async () => {
      const blocks = await blockStore.getBlocksForCheckpoint(CheckpointNumber(1));
      expect(blocks).toBeUndefined();
    });
  });

  describe('getRangeOfCheckpoints', () => {
    it('returns empty array when no checkpoints exist', async () => {
      const checkpoints = await blockStore.getRangeOfCheckpoints(CheckpointNumber(1), 10);
      expect(checkpoints).toEqual([]);
    });

    it('returns single checkpoint', async () => {
      const checkpoint = makePublishedCheckpoint(
        await Checkpoint.random(CheckpointNumber(1), { numBlocks: 2, startBlockNumber: 1 }),
        10,
      );
      await blockStore.addCheckpoints([checkpoint]);

      const checkpoints = await blockStore.getRangeOfCheckpoints(CheckpointNumber(1), 10);
      expect(checkpoints.length).toBe(1);
      expect(checkpoints[0].checkpointNumber).toBe(1);
      expect(checkpoints[0].startBlock).toBe(1);
      expect(checkpoints[0].blockCount).toBe(2);
    });

    it('returns multiple checkpoints in order', async () => {
      // Create checkpoints with chained archive roots
      const checkpoint1Cp = await Checkpoint.random(CheckpointNumber(1), { numBlocks: 2, startBlockNumber: 1 });
      const checkpoint1 = makePublishedCheckpoint(checkpoint1Cp, 10);

      const previousArchive1 = checkpoint1Cp.blocks.at(-1)!.archive;
      const checkpoint2Cp = await Checkpoint.random(CheckpointNumber(2), {
        numBlocks: 3,
        startBlockNumber: 3,
        previousArchive: previousArchive1,
      });
      const checkpoint2 = makePublishedCheckpoint(checkpoint2Cp, 11);

      const previousArchive2 = checkpoint2Cp.blocks.at(-1)!.archive;
      const checkpoint3Cp = await Checkpoint.random(CheckpointNumber(3), {
        numBlocks: 1,
        startBlockNumber: 6,
        previousArchive: previousArchive2,
      });
      const checkpoint3 = makePublishedCheckpoint(checkpoint3Cp, 12);

      await blockStore.addCheckpoints([checkpoint1, checkpoint2, checkpoint3]);

      const checkpoints = await blockStore.getRangeOfCheckpoints(CheckpointNumber(1), 10);
      expect(checkpoints.length).toBe(3);
      expect(checkpoints.map(c => c.checkpointNumber)).toEqual([1, 2, 3]);
      expect(checkpoints.map(c => c.startBlock)).toEqual([1, 3, 6]);
      expect(checkpoints.map(c => c.blockCount)).toEqual([2, 3, 1]);
    });

    it('respects the from parameter', async () => {
      // Create checkpoints with chained archive roots
      const checkpoint1Cp = await Checkpoint.random(CheckpointNumber(1), { numBlocks: 2, startBlockNumber: 1 });
      const checkpoint1 = makePublishedCheckpoint(checkpoint1Cp, 10);

      const previousArchive1 = checkpoint1Cp.blocks.at(-1)!.archive;
      const checkpoint2Cp = await Checkpoint.random(CheckpointNumber(2), {
        numBlocks: 2,
        startBlockNumber: 3,
        previousArchive: previousArchive1,
      });
      const checkpoint2 = makePublishedCheckpoint(checkpoint2Cp, 11);

      const previousArchive2 = checkpoint2Cp.blocks.at(-1)!.archive;
      const checkpoint3Cp = await Checkpoint.random(CheckpointNumber(3), {
        numBlocks: 2,
        startBlockNumber: 5,
        previousArchive: previousArchive2,
      });
      const checkpoint3 = makePublishedCheckpoint(checkpoint3Cp, 12);

      await blockStore.addCheckpoints([checkpoint1, checkpoint2, checkpoint3]);

      // Start from checkpoint 2
      const checkpoints = await blockStore.getRangeOfCheckpoints(CheckpointNumber(2), 10);
      expect(checkpoints.length).toBe(2);
      expect(checkpoints.map(c => c.checkpointNumber)).toEqual([2, 3]);
    });

    it('respects the limit parameter', async () => {
      // Create checkpoints with chained archive roots
      const checkpoint1Cp = await Checkpoint.random(CheckpointNumber(1), { numBlocks: 1, startBlockNumber: 1 });
      const checkpoint1 = makePublishedCheckpoint(checkpoint1Cp, 10);

      const previousArchive1 = checkpoint1Cp.blocks.at(-1)!.archive;
      const checkpoint2Cp = await Checkpoint.random(CheckpointNumber(2), {
        numBlocks: 1,
        startBlockNumber: 2,
        previousArchive: previousArchive1,
      });
      const checkpoint2 = makePublishedCheckpoint(checkpoint2Cp, 11);

      const previousArchive2 = checkpoint2Cp.blocks.at(-1)!.archive;
      const checkpoint3Cp = await Checkpoint.random(CheckpointNumber(3), {
        numBlocks: 1,
        startBlockNumber: 3,
        previousArchive: previousArchive2,
      });
      const checkpoint3 = makePublishedCheckpoint(checkpoint3Cp, 12);

      const previousArchive3 = checkpoint3Cp.blocks.at(-1)!.archive;
      const checkpoint4Cp = await Checkpoint.random(CheckpointNumber(4), {
        numBlocks: 1,
        startBlockNumber: 4,
        previousArchive: previousArchive3,
      });
      const checkpoint4 = makePublishedCheckpoint(checkpoint4Cp, 13);

      await blockStore.addCheckpoints([checkpoint1, checkpoint2, checkpoint3, checkpoint4]);

      // Only get 2 checkpoints
      const checkpoints = await blockStore.getRangeOfCheckpoints(CheckpointNumber(1), 2);
      expect(checkpoints.length).toBe(2);
      expect(checkpoints.map(c => c.checkpointNumber)).toEqual([1, 2]);
    });

    it('returns correct checkpoint data including L1 info', async () => {
      const checkpoint = makePublishedCheckpoint(
        await Checkpoint.random(CheckpointNumber(1), { numBlocks: 3, startBlockNumber: 1 }),
        42,
      );
      await blockStore.addCheckpoints([checkpoint]);

      const checkpoints = await blockStore.getRangeOfCheckpoints(CheckpointNumber(1), 1);
      expect(checkpoints.length).toBe(1);

      const data = checkpoints[0];
      expect(data.checkpointNumber).toBe(1);
      expect(data.startBlock).toBe(1);
      expect(data.blockCount).toBe(3);
      expect(data.l1.blockNumber).toBe(42n);
      expect(data.header.equals(checkpoint.checkpoint.header)).toBe(true);
      expect(data.archive.equals(checkpoint.checkpoint.archive)).toBe(true);
    });

    it('returns empty array when from is beyond available checkpoints', async () => {
      const checkpoint = makePublishedCheckpoint(
        await Checkpoint.random(CheckpointNumber(1), { numBlocks: 2, startBlockNumber: 1 }),
        10,
      );
      await blockStore.addCheckpoints([checkpoint]);

      const checkpoints = await blockStore.getRangeOfCheckpoints(CheckpointNumber(5), 10);
      expect(checkpoints).toEqual([]);
    });

    it('works correctly after unwinding checkpoints', async () => {
      // Create checkpoints with chained archive roots
      const checkpoint1Cp = await Checkpoint.random(CheckpointNumber(1), { numBlocks: 2, startBlockNumber: 1 });
      const checkpoint1 = makePublishedCheckpoint(checkpoint1Cp, 10);

      const previousArchive1 = checkpoint1Cp.blocks.at(-1)!.archive;
      const checkpoint2Cp = await Checkpoint.random(CheckpointNumber(2), {
        numBlocks: 2,
        startBlockNumber: 3,
        previousArchive: previousArchive1,
      });
      const checkpoint2 = makePublishedCheckpoint(checkpoint2Cp, 11);

      const previousArchive2 = checkpoint2Cp.blocks.at(-1)!.archive;
      const checkpoint3Cp = await Checkpoint.random(CheckpointNumber(3), {
        numBlocks: 2,
        startBlockNumber: 5,
        previousArchive: previousArchive2,
      });
      const checkpoint3 = makePublishedCheckpoint(checkpoint3Cp, 12);

      await blockStore.addCheckpoints([checkpoint1, checkpoint2, checkpoint3]);

      // Remove checkpoint 3
      await blockStore.removeCheckpointsAfter(CheckpointNumber(2));

      const checkpoints = await blockStore.getRangeOfCheckpoints(CheckpointNumber(1), 10);
      expect(checkpoints.length).toBe(2);
      expect(checkpoints.map(c => c.checkpointNumber)).toEqual([1, 2]);
    });
  });

  describe('getCheckpointNumbersForSlotRange', () => {
    it('returns empty array when no checkpoints exist', async () => {
      const numbers = await blockStore.getCheckpointNumbersForSlotRange(SlotNumber(0), SlotNumber(100));
      expect(numbers).toEqual([]);
    });

    it('returns checkpoint numbers for checkpoints whose slot is within the range (inclusive)', async () => {
      const cp1 = makePublishedCheckpoint(
        await Checkpoint.random(CheckpointNumber(1), { numBlocks: 1, startBlockNumber: 1, slotNumber: SlotNumber(5) }),
        10,
      );
      const previousArchive1 = cp1.checkpoint.blocks.at(-1)!.archive;
      const cp2 = makePublishedCheckpoint(
        await Checkpoint.random(CheckpointNumber(2), {
          numBlocks: 1,
          startBlockNumber: 2,
          previousArchive: previousArchive1,
          slotNumber: SlotNumber(8),
        }),
        11,
      );
      const previousArchive2 = cp2.checkpoint.blocks.at(-1)!.archive;
      const cp3 = makePublishedCheckpoint(
        await Checkpoint.random(CheckpointNumber(3), {
          numBlocks: 1,
          startBlockNumber: 3,
          previousArchive: previousArchive2,
          slotNumber: SlotNumber(12),
        }),
        12,
      );
      await blockStore.addCheckpoints([cp1, cp2, cp3]);

      // Inclusive range covering all three slots
      expect(await blockStore.getCheckpointNumbersForSlotRange(SlotNumber(0), SlotNumber(20))).toEqual([1, 2, 3]);

      // Range that excludes the first checkpoint
      expect(await blockStore.getCheckpointNumbersForSlotRange(SlotNumber(6), SlotNumber(20))).toEqual([2, 3]);

      // Range that includes only the middle checkpoint (endpoints are inclusive)
      expect(await blockStore.getCheckpointNumbersForSlotRange(SlotNumber(8), SlotNumber(8))).toEqual([2]);

      // Range with no matching checkpoints
      expect(await blockStore.getCheckpointNumbersForSlotRange(SlotNumber(9), SlotNumber(11))).toEqual([]);
    });

    it('reflects unwound checkpoints', async () => {
      const cp1 = makePublishedCheckpoint(
        await Checkpoint.random(CheckpointNumber(1), { numBlocks: 1, startBlockNumber: 1, slotNumber: SlotNumber(1) }),
        10,
      );
      const previousArchive1 = cp1.checkpoint.blocks.at(-1)!.archive;
      const cp2 = makePublishedCheckpoint(
        await Checkpoint.random(CheckpointNumber(2), {
          numBlocks: 1,
          startBlockNumber: 2,
          previousArchive: previousArchive1,
          slotNumber: SlotNumber(2),
        }),
        11,
      );
      await blockStore.addCheckpoints([cp1, cp2]);

      await blockStore.removeCheckpointsAfter(CheckpointNumber(1));

      expect(await blockStore.getCheckpointNumbersForSlotRange(SlotNumber(0), SlotNumber(10))).toEqual([1]);
    });
  });

  describe('getCheckpointedBlock', () => {
    beforeEach(async () => {
      await blockStore.addCheckpoints(publishedCheckpoints);
    });

    it.each(blockNumberTests)('retrieves previously stored block %i', async (blockNumber, getExpectedBlock) => {
      const retrievedBlock = await blockStore.getBlock({ number: BlockNumber(blockNumber) });
      const expectedBlock = getExpectedBlock();
      const expectedCheckpoint = publishedCheckpoints[blockNumber - 1];

      expect(retrievedBlock).toBeDefined();
      await expectCheckpointedBlockEquals(retrievedBlock!, expectedBlock, expectedCheckpoint);
    });

    it('returns undefined if block is not found', async () => {
      await expect(blockStore.getBlock({ number: BlockNumber(12) })).resolves.toBeUndefined();
    });

    it('returns undefined for block number 0', async () => {
      await expect(blockStore.getBlock({ number: BlockNumber(0) })).resolves.toBeUndefined();
    });
  });

  describe('getCheckpointedBlockByHash', () => {
    beforeEach(async () => {
      await blockStore.addCheckpoints(publishedCheckpoints);
    });

    it('retrieves a block by its hash', async () => {
      const expectedCheckpoint = publishedCheckpoints[5];
      const expectedBlock = expectedCheckpoint.checkpoint.blocks[0];
      const blockHash = await expectedBlock.header.hash();
      const retrievedBlock = await blockStore.getBlock({ hash: blockHash });

      expect(retrievedBlock).toBeDefined();
      await expectCheckpointedBlockEquals(retrievedBlock!, expectedBlock, expectedCheckpoint);
    });

    it('returns undefined for non-existent block hash', async () => {
      const nonExistentHash = BlockHash.random();
      await expect(blockStore.getBlock({ hash: nonExistentHash })).resolves.toBeUndefined();
    });
  });

  describe('getCheckpointedBlockByArchive', () => {
    beforeEach(async () => {
      await blockStore.addCheckpoints(publishedCheckpoints);
    });

    it('retrieves a block by its archive root', async () => {
      const expectedCheckpoint = publishedCheckpoints[3];
      const expectedBlock = expectedCheckpoint.checkpoint.blocks[0];
      const archive = expectedBlock.archive.root;
      const retrievedBlock = await blockStore.getBlock({ archive: archive });

      expect(retrievedBlock).toBeDefined();
      await expectCheckpointedBlockEquals(retrievedBlock!, expectedBlock, expectedCheckpoint);
    });

    it('returns undefined for non-existent archive root', async () => {
      const nonExistentArchive = Fr.random();
      await expect(blockStore.getBlock({ archive: nonExistentArchive })).resolves.toBeUndefined();
    });
  });

  describe('getBlockData by hash', () => {
    beforeEach(async () => {
      await blockStore.addCheckpoints(publishedCheckpoints);
    });

    it('retrieves block header by hash', async () => {
      const expectedBlock = publishedCheckpoints[7].checkpoint.blocks[0];
      const blockHash = await expectedBlock.header.hash();
      const retrievedHeader = (await blockStore.getBlockData({ hash: blockHash }))?.header;

      expect(retrievedHeader).toBeDefined();
      expect(retrievedHeader!.equals(expectedBlock.header)).toBe(true);
    });

    it('returns undefined for non-existent block hash', async () => {
      const nonExistentHash = BlockHash.random();
      await expect(blockStore.getBlockData({ hash: nonExistentHash })).resolves.toBeUndefined();
    });
  });

  describe('getBlockData by archive', () => {
    beforeEach(async () => {
      await blockStore.addCheckpoints(publishedCheckpoints);
    });

    it('retrieves block header by archive root', async () => {
      const expectedBlock = publishedCheckpoints[2].checkpoint.blocks[0];
      const archive = expectedBlock.archive.root;
      const retrievedHeader = (await blockStore.getBlockData({ archive: archive }))?.header;

      expect(retrievedHeader).toBeDefined();
      expect(retrievedHeader!.equals(expectedBlock.header)).toBe(true);
    });

    it('returns undefined for non-existent archive root', async () => {
      const nonExistentArchive = Fr.random();
      await expect(blockStore.getBlockData({ archive: nonExistentArchive })).resolves.toBeUndefined();
    });
  });

  describe('getBlockNumber', () => {
    beforeEach(async () => {
      await blockStore.addCheckpoints(publishedCheckpoints);
    });

    it('resolves a number query', async () => {
      await expect(blockStore.getBlockNumber({ number: BlockNumber(3) })).resolves.toBe(3);
    });

    it('resolves a hash query', async () => {
      const block = publishedCheckpoints[4].checkpoint.blocks[0];
      const hash = await block.header.hash();
      await expect(blockStore.getBlockNumber({ hash })).resolves.toBe(block.number);
    });

    it('resolves an archive query', async () => {
      const block = publishedCheckpoints[6].checkpoint.blocks[0];
      await expect(blockStore.getBlockNumber({ archive: block.archive.root })).resolves.toBe(block.number);
    });

    it('returns undefined for unknown hash', async () => {
      await expect(blockStore.getBlockNumber({ hash: BlockHash.random() })).resolves.toBeUndefined();
    });

    it('returns undefined for unknown archive', async () => {
      await expect(blockStore.getBlockNumber({ archive: Fr.random() })).resolves.toBeUndefined();
    });
  });

  describe('getSynchedCheckpointNumber', () => {
    it('returns the checkpoint number before INITIAL_CHECKPOINT_NUMBER if no checkpoints have been added', async () => {
      await expect(blockStore.getLatestCheckpointNumber()).resolves.toEqual(INITIAL_CHECKPOINT_NUMBER - 1);
    });

    it('returns the most recently added checkpoint number', async () => {
      await blockStore.addCheckpoints(publishedCheckpoints);
      await expect(blockStore.getLatestCheckpointNumber()).resolves.toEqual(
        publishedCheckpoints.at(-1)!.checkpoint.number,
      );
    });
  });

  describe('getTxEffect', () => {
    const getBlock = (i: number) => publishedCheckpoints[i].checkpoint.blocks[0];

    beforeEach(async () => {
      await blockStore.addCheckpoints(publishedCheckpoints);
    });

    it.each([
      () => ({ data: getBlock(0).body.txEffects[0], block: getBlock(0), txIndexInBlock: 0 }),
      () => ({ data: getBlock(9).body.txEffects[3], block: getBlock(9), txIndexInBlock: 3 }),
      () => ({ data: getBlock(3).body.txEffects[1], block: getBlock(3), txIndexInBlock: 1 }),
      () => ({ data: getBlock(5).body.txEffects[2], block: getBlock(5), txIndexInBlock: 2 }),
      () => ({ data: getBlock(1).body.txEffects[0], block: getBlock(1), txIndexInBlock: 0 }),
    ])('retrieves a previously stored transaction', async getExpectedTx => {
      const { data, block, txIndexInBlock } = getExpectedTx();
      const expectedTx: IndexedTxEffect = {
        data,
        l2BlockNumber: block.number,
        l2BlockHash: await block.header.hash(),
        txIndexInBlock,
      };
      const actualTx = await blockStore.getTxEffect(data.txHash);
      expect(actualTx).toEqual(expectedTx);
    });

    it('returns undefined if tx is not found', async () => {
      await expect(blockStore.getTxEffect(TxHash.random())).resolves.toBeUndefined();
    });

    it.each([
      () => getBlock(0).body.txEffects[0],
      () => getBlock(9).body.txEffects[3],
      () => getBlock(3).body.txEffects[1],
      () => getBlock(5).body.txEffects[2],
      () => getBlock(1).body.txEffects[0],
    ])('tries to retrieves a previously stored transaction after deleted', async getTxEffect => {
      await blockStore.removeCheckpointsAfter(CheckpointNumber(0));

      const txEffect = getTxEffect();
      const actualTx = await blockStore.getTxEffect(txEffect.txHash);
      expect(actualTx).toEqual(undefined);
    });

    it('returns undefined if tx is not found', async () => {
      await expect(blockStore.getTxEffect(TxHash.random())).resolves.toBeUndefined();
    });

    it('does not fail if the block is removed while requesting a tx', async () => {
      const txEffect = getBlock(1).body.txEffects[0];
      let done = false;
      void (async () => {
        while (!done) {
          void blockStore.getTxEffect(txEffect.txHash);
          await sleep(1);
        }
      })();
      await blockStore.removeCheckpointsAfter(CheckpointNumber(0));
      done = true;
      expect(await blockStore.getTxEffect(txEffect.txHash)).toEqual(undefined);
    });
  });

  describe('pendingChainValidationStatus', () => {
    it('should return undefined when no status is set', async () => {
      const status = await blockStore.getPendingChainValidationStatus();
      expect(status).toBeUndefined();
    });

    it('should store and retrieve a valid validation status', async () => {
      const validStatus: ValidateCheckpointResult = { valid: true };

      await blockStore.setPendingChainValidationStatus(validStatus);
      const retrievedStatus = await blockStore.getPendingChainValidationStatus();

      expect(retrievedStatus).toEqual(validStatus);
    });

    it('should store and retrieve an invalid validation status with insufficient attestations', async () => {
      const invalidStatus: ValidateCheckpointResult = {
        valid: false,
        checkpoint: randomCheckpointInfo(1),
        committee: [EthAddress.random(), EthAddress.random()],
        epoch: EpochNumber(123),
        seed: 456n,
        attestors: [EthAddress.random()],
        attestations: [CommitteeAttestation.random()],
        reason: 'insufficient-attestations',
      };

      await blockStore.setPendingChainValidationStatus(invalidStatus);
      const retrievedStatus = await blockStore.getPendingChainValidationStatus();

      expect(retrievedStatus).toEqual(invalidStatus);
    });

    it('should store and retrieve an invalid validation status with invalid attestation', async () => {
      const invalidStatus: ValidateCheckpointResult = {
        valid: false,
        checkpoint: randomCheckpointInfo(2),
        committee: [EthAddress.random()],
        attestors: [EthAddress.random()],
        epoch: EpochNumber(789),
        seed: 101n,
        attestations: [CommitteeAttestation.random()],
        reason: 'invalid-attestation',
        invalidIndex: 5,
      };

      await blockStore.setPendingChainValidationStatus(invalidStatus);
      const retrievedStatus = await blockStore.getPendingChainValidationStatus();

      expect(retrievedStatus).toEqual(invalidStatus);
    });

    it('should overwrite existing status when setting a new one', async () => {
      const firstStatus: ValidateCheckpointResult = { valid: true };
      const secondStatus: ValidateCheckpointResult = {
        valid: false,
        checkpoint: randomCheckpointInfo(3),
        committee: [EthAddress.random()],
        epoch: EpochNumber(999),
        seed: 888n,
        attestors: [EthAddress.random()],
        attestations: [CommitteeAttestation.random()],
        reason: 'insufficient-attestations',
      };

      await blockStore.setPendingChainValidationStatus(firstStatus);
      await blockStore.setPendingChainValidationStatus(secondStatus);
      const retrievedStatus = await blockStore.getPendingChainValidationStatus();

      expect(retrievedStatus).toEqual(secondStatus);
    });

    it('should handle empty committee and attestations arrays', async () => {
      const statusWithEmptyArrays: ValidateCheckpointResult = {
        valid: false,
        checkpoint: randomCheckpointInfo(4),
        committee: [],
        epoch: EpochNumber(0),
        seed: 0n,
        attestors: [],
        attestations: [],
        reason: 'insufficient-attestations',
      };

      await blockStore.setPendingChainValidationStatus(statusWithEmptyArrays);
      const retrievedStatus = await blockStore.getPendingChainValidationStatus();

      expect(retrievedStatus).toEqual(statusWithEmptyArrays);
    });
  });

  describe('idempotency', () => {
    it('handles adding blocks via addProposedBlock then same blocks via addCheckpoints', async () => {
      // First add checkpoint 1 to establish a base
      const checkpoint1 = makePublishedCheckpoint(
        await Checkpoint.random(CheckpointNumber(1), { numBlocks: 1, startBlockNumber: 1 }),
        5,
      );
      await blockStore.addCheckpoints([checkpoint1]);

      // Add provisional block 2 via addProposedBlock
      const provisionalBlock = await L2Block.random(BlockNumber(2), {
        checkpointNumber: CheckpointNumber(2),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        lastArchive: checkpoint1.checkpoint.blocks[0].archive,
      });
      await blockStore.addProposedBlock(provisionalBlock);

      // Now add checkpoint 2 containing the same block via addCheckpoints
      const checkpoint2 = new Checkpoint(
        provisionalBlock.archive,
        CheckpointHeader.random(),
        [provisionalBlock],
        CheckpointNumber(2),
      );
      const publishedCheckpoint2 = makePublishedCheckpoint(checkpoint2, 10);

      // This should NOT throw - addCheckpoints uses .set() which is idempotent
      await expect(blockStore.addCheckpoints([publishedCheckpoint2])).resolves.toBe(true);

      // Verify block exists and is consistent
      const storedBlock = await blockStore.getBlock({ number: BlockNumber(2) });
      expect(storedBlock?.archive.root.equals(provisionalBlock.archive.root)).toBe(true);
    });

    // Note: contract class/instance idempotency tests moved to contract_class_store.test.ts /
    // contract_instance_store.test.ts. Log idempotency moved to log_store.test.ts.
  });

  describe('getBlocksForSlot', () => {
    it('returns blocks matching the given slot number', async () => {
      // Create blocks with specific slot numbers
      const block1 = await L2Block.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        slotNumber: SlotNumber(100),
      });
      const block2 = await L2Block.random(BlockNumber(2), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(1),
        lastArchive: block1.archive,
        slotNumber: SlotNumber(100), // Same slot number as block1
      });
      const block3 = await L2Block.random(BlockNumber(3), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(2),
        lastArchive: block2.archive,
        slotNumber: SlotNumber(101), // Different slot number
      });

      await addProposedBlocks(blockStore, [block1, block2, block3]);

      const blocksForSlot100 = await blockStore.getBlocksForSlot(SlotNumber(100));
      expect(blocksForSlot100.length).toBe(2);
      expect(blocksForSlot100[0].equals(block1)).toBe(true);
      expect(blocksForSlot100[1].equals(block2)).toBe(true);

      const blocksForSlot101 = await blockStore.getBlocksForSlot(SlotNumber(101));
      expect(blocksForSlot101.length).toBe(1);
      expect(blocksForSlot101[0].equals(block3)).toBe(true);
    });

    it('returns empty array when no blocks exist for that slot', async () => {
      // Create a block with a specific slot number
      const block1 = await L2Block.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        slotNumber: SlotNumber(100),
      });

      await blockStore.addProposedBlock(block1);

      const blocksForSlot999 = await blockStore.getBlocksForSlot(SlotNumber(999));
      expect(blocksForSlot999).toEqual([]);
    });

    it('returns empty array when store is empty', async () => {
      const blocksForSlot = await blockStore.getBlocksForSlot(SlotNumber(1));
      expect(blocksForSlot).toEqual([]);
    });

    it('returns blocks in ascending block number order', async () => {
      // Create multiple blocks with the same slot number
      const block1 = await L2Block.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        slotNumber: SlotNumber(50),
      });
      const block2 = await L2Block.random(BlockNumber(2), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(1),
        lastArchive: block1.archive,
        slotNumber: SlotNumber(50),
      });
      const block3 = await L2Block.random(BlockNumber(3), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(2),
        lastArchive: block2.archive,
        slotNumber: SlotNumber(50),
      });

      await addProposedBlocks(blockStore, [block1, block2, block3]);

      const blocksForSlot = await blockStore.getBlocksForSlot(SlotNumber(50));
      expect(blocksForSlot.length).toBe(3);
      expect(blocksForSlot[0].number).toBe(1);
      expect(blocksForSlot[1].number).toBe(2);
      expect(blocksForSlot[2].number).toBe(3);
    });
  });

  describe('proposedCheckpointNumber', () => {
    /** Adds proposed blocks to the store so addProposedCheckpoint can validate them.
     *  Uses force: true to skip addProposedBlock's own chaining checks (we only want to test addProposedCheckpoint). */
    async function addBlocksForProposedCheckpoint(
      startBlock: number,
      blockCount: number,
      checkpointNumber: number,
      previousArchive?: AppendOnlyTreeSnapshot,
    ): Promise<void> {
      for (let i = 0; i < blockCount; i++) {
        const opts: Parameters<typeof L2Block.random>[1] = {
          checkpointNumber: CheckpointNumber(checkpointNumber),
          indexWithinCheckpoint: IndexWithinCheckpoint(i),
        };
        if (i === 0 && previousArchive) {
          (opts as any).lastArchive = previousArchive;
        }
        const block = await L2Block.random(BlockNumber(startBlock + i), opts);
        await blockStore.addProposedBlock(block, { force: true });
      }
    }

    it('returns initial value when no proposed checkpoint is set', async () => {
      const pending = await blockStore.getProposedCheckpointNumber();
      expect(pending).toBe(INITIAL_CHECKPOINT_NUMBER - 1);
    });

    it('stores and retrieves proposed checkpoint number', async () => {
      await addBlocksForProposedCheckpoint(1, 1, 1);
      await blockStore.addProposedCheckpoint({
        checkpointNumber: CheckpointNumber(1),
        header: CheckpointHeader.empty(),
        startBlock: BlockNumber(1),
        blockCount: 1,
        totalManaUsed: 100n,
        feeAssetPriceModifier: 50n,
      });
      const pending = await blockStore.getProposedCheckpointNumber();
      expect(pending).toBe(1);
    });

    it('stores and retrieves proposed checkpoint data with fee fields', async () => {
      await addBlocksForProposedCheckpoint(1, 1, 1);
      await blockStore.addProposedCheckpoint({
        checkpointNumber: CheckpointNumber(1),
        header: CheckpointHeader.empty(),
        startBlock: BlockNumber(1),
        blockCount: 1,
        totalManaUsed: 12345n,
        feeAssetPriceModifier: -75n,
      });
      const pending = await blockStore.getLastProposedCheckpoint();
      expect(pending).toBeDefined();
      expect(pending!.checkpointNumber).toBe(1);
      expect(pending!.totalManaUsed).toBe(12345n);
      expect(pending!.feeAssetPriceModifier).toBe(-75n);
    });

    it('clears proposed checkpoint when confirmed checkpoints are added', async () => {
      // Add checkpoint 1
      const checkpoint1 = makePublishedCheckpoint(
        await Checkpoint.random(CheckpointNumber(1), { numBlocks: 1, startBlockNumber: 1 }),
        10,
      );
      await blockStore.addCheckpoints([checkpoint1]);

      // Add blocks for proposed checkpoint 2, chaining from checkpoint 1's last block
      await addBlocksForProposedCheckpoint(2, 1, 2, checkpoint1.checkpoint.blocks[0].archive);

      // Set proposed checkpoint to 2 (attested but not yet on L1)
      await blockStore.addProposedCheckpoint({
        checkpointNumber: CheckpointNumber(2),
        header: CheckpointHeader.empty(),
        startBlock: BlockNumber(2),
        blockCount: 1,
        totalManaUsed: 100n,
        feeAssetPriceModifier: 50n,
      });
      expect(await blockStore.getProposedCheckpointNumber()).toBe(2);

      // Confirm checkpoint 2 on L1
      const checkpoint2 = makePublishedCheckpoint(
        await Checkpoint.random(CheckpointNumber(2), {
          numBlocks: 1,
          startBlockNumber: 2,
          previousArchive: checkpoint1.checkpoint.blocks[0].archive,
        }),
        20,
      );
      await blockStore.addCheckpoints([checkpoint2]);

      // Proposed checkpoint should be cleared
      expect(await blockStore.hasProposedCheckpoint()).toBe(false);
    });

    it('throws on proposed checkpoint that is more than 1 ahead of confirmed', async () => {
      // Add checkpoint 1
      const checkpoint1 = makePublishedCheckpoint(
        await Checkpoint.random(CheckpointNumber(1), { numBlocks: 1, startBlockNumber: 1 }),
        10,
      );
      await blockStore.addCheckpoints([checkpoint1]);

      // Try to set proposed checkpoint to 3 (confirmed=1, expected=2)
      await expect(
        blockStore.addProposedCheckpoint({
          checkpointNumber: CheckpointNumber(3),
          header: CheckpointHeader.empty(),
          startBlock: BlockNumber(1),
          blockCount: 1,
          totalManaUsed: 100n,
          feeAssetPriceModifier: 50n,
        }),
      ).rejects.toThrow('not sequential');

      // Proposed checkpoint should remain unset (3 !== 1 + 1)
      expect(await blockStore.hasProposedCheckpoint()).toBe(false);
    });

    it('throws on proposed checkpoint that equals the confirmed checkpoint', async () => {
      // Add checkpoint 1
      const checkpoint1 = makePublishedCheckpoint(
        await Checkpoint.random(CheckpointNumber(1), { numBlocks: 1, startBlockNumber: 1 }),
        10,
      );
      await blockStore.addCheckpoints([checkpoint1]);

      // Try to set proposed checkpoint to 1 (confirmed=1, expected=2).
      // With fallback behavior, getProposedCheckpointNumber returns 1 (confirmed), so this triggers the stale check.
      await expect(
        blockStore.addProposedCheckpoint({
          checkpointNumber: CheckpointNumber(1),
          header: CheckpointHeader.empty(),
          startBlock: BlockNumber(1),
          blockCount: 1,
          totalManaUsed: 100n,
          feeAssetPriceModifier: 50n,
        }),
      ).rejects.toThrow('not sequential');

      // Proposed checkpoint should remain unset
      expect(await blockStore.hasProposedCheckpoint()).toBe(false);
    });

    it('clears proposed checkpoint when checkpoints are removed past it', async () => {
      // Add checkpoints 1 and 2
      const checkpoint1 = makePublishedCheckpoint(
        await Checkpoint.random(CheckpointNumber(1), { numBlocks: 1, startBlockNumber: 1 }),
        10,
      );
      const checkpoint2 = makePublishedCheckpoint(
        await Checkpoint.random(CheckpointNumber(2), {
          numBlocks: 1,
          startBlockNumber: 2,
          previousArchive: checkpoint1.checkpoint.blocks[0].archive,
        }),
        20,
      );
      await blockStore.addCheckpoints([checkpoint1, checkpoint2]);

      // Add blocks for proposed checkpoint 3, chaining from checkpoint 2's last block
      await addBlocksForProposedCheckpoint(3, 1, 3, checkpoint2.checkpoint.blocks[0].archive);

      // Set proposed checkpoint to 3
      await blockStore.addProposedCheckpoint({
        checkpointNumber: CheckpointNumber(3),
        header: CheckpointHeader.empty(),
        startBlock: BlockNumber(3),
        blockCount: 1,
        totalManaUsed: 100n,
        feeAssetPriceModifier: 50n,
      });

      // Remove checkpoints after 1 (removes checkpoint 2, and pending 3 should be cleared)
      await blockStore.removeCheckpointsAfter(CheckpointNumber(1));

      expect(await blockStore.hasProposedCheckpoint()).toBe(false);
    });

    it('does not clear proposed checkpoint when removing checkpoints before it', async () => {
      // Add checkpoints 1, 2
      const checkpoint1 = makePublishedCheckpoint(
        await Checkpoint.random(CheckpointNumber(1), { numBlocks: 1, startBlockNumber: 1 }),
        10,
      );
      const checkpoint2 = makePublishedCheckpoint(
        await Checkpoint.random(CheckpointNumber(2), {
          numBlocks: 1,
          startBlockNumber: 2,
          previousArchive: checkpoint1.checkpoint.blocks[0].archive,
        }),
        20,
      );
      await blockStore.addCheckpoints([checkpoint1, checkpoint2]);

      // Add blocks for proposed checkpoint 3, chaining from checkpoint 2's last block
      await addBlocksForProposedCheckpoint(3, 1, 3, checkpoint2.checkpoint.blocks[0].archive);

      // Set pending to 3 (confirmed=2, 3===2+1 ✓)
      await blockStore.addProposedCheckpoint({
        checkpointNumber: CheckpointNumber(3),
        header: CheckpointHeader.empty(),
        startBlock: BlockNumber(3),
        blockCount: 1,
        totalManaUsed: 100n,
        feeAssetPriceModifier: 50n,
      });

      // Remove checkpoints after 2 (nothing removed since latest is 2, pending=3 stays)
      await blockStore.removeCheckpointsAfter(CheckpointNumber(2));

      expect(await blockStore.getProposedCheckpointNumber()).toBe(3);
    });

    it('allows addProposedBlocks when proposed checkpoint matches expected', async () => {
      // Add checkpoint 1
      const checkpoint1 = makePublishedCheckpoint(
        await Checkpoint.random(CheckpointNumber(1), { numBlocks: 1, startBlockNumber: 1 }),
        10,
      );
      await blockStore.addCheckpoints([checkpoint1]);

      // Add blocks for proposed checkpoint 2, chaining from checkpoint 1's last block
      await addBlocksForProposedCheckpoint(2, 1, 2, checkpoint1.checkpoint.blocks[0].archive);

      // Set proposed checkpoint to 2 (attested but not on L1 yet)
      await blockStore.addProposedCheckpoint({
        checkpointNumber: CheckpointNumber(2),
        header: CheckpointHeader.empty(),
        startBlock: BlockNumber(2),
        blockCount: 1,
        totalManaUsed: 100n,
        feeAssetPriceModifier: 50n,
      });

      // Add a block for checkpoint 3 — this should succeed because
      // proposed checkpoint (2) matches expectedCheckpointNumber (3 - 1 = 2)
      const pendingBlock = await blockStore.getBlock({ number: BlockNumber(2) });
      const block3 = await L2Block.random(BlockNumber(3), {
        checkpointNumber: CheckpointNumber(3),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        lastArchive: pendingBlock!.archive,
      });

      await expect(blockStore.addProposedBlock(block3)).resolves.toBe(true);
    });

    it('throws with proposed checkpoint value when neither confirmed nor pending matches', async () => {
      // Add checkpoint 1
      const checkpoint1 = makePublishedCheckpoint(
        await Checkpoint.random(CheckpointNumber(1), { numBlocks: 1, startBlockNumber: 1 }),
        10,
      );
      await blockStore.addCheckpoints([checkpoint1]);

      // Add blocks for proposed checkpoint 2, chaining from checkpoint 1's last block
      await addBlocksForProposedCheckpoint(2, 1, 2, checkpoint1.checkpoint.blocks[0].archive);

      // Set proposed checkpoint to 2
      await blockStore.addProposedCheckpoint({
        checkpointNumber: CheckpointNumber(2),
        header: CheckpointHeader.empty(),
        startBlock: BlockNumber(2),
        blockCount: 1,
        totalManaUsed: 100n,
        feeAssetPriceModifier: 50n,
      });

      // Try to add a block for checkpoint 4 (expected = 3, confirmed = 1, pending = 2 — neither matches)
      const pendingBlock = await blockStore.getBlock({ number: BlockNumber(2) });
      const block3 = await L2Block.random(BlockNumber(3), {
        checkpointNumber: CheckpointNumber(4),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        lastArchive: pendingBlock!.archive,
      });

      await expect(blockStore.addProposedBlock(block3)).rejects.toThrow(
        // Error should report the proposed checkpoint number (2), not the confirmed one (1)
        'Cannot insert new block 3 for checkpoint 4 given previous checkpoint number is 2',
      );
    });

    it('throws with confirmed checkpoint value when pending is not set', async () => {
      // Add checkpoint 1 (no pending set, so pending defaults to 0)
      const checkpoint1 = makePublishedCheckpoint(
        await Checkpoint.random(CheckpointNumber(1), { numBlocks: 1, startBlockNumber: 1 }),
        10,
      );
      await blockStore.addCheckpoints([checkpoint1]);

      // Try to add a block for checkpoint 4 (expected = 3, confirmed = 1, pending = 0)
      // Error should report confirmed (1) since it's higher than the default pending (0)
      const lastBlockArchive = checkpoint1.checkpoint.blocks[0].archive;
      const block2 = await L2Block.random(BlockNumber(2), {
        checkpointNumber: CheckpointNumber(4),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        lastArchive: lastBlockArchive,
      });

      await expect(blockStore.addProposedBlock(block2)).rejects.toThrow(
        'Cannot insert new block 2 for checkpoint 4 given previous checkpoint number is 1',
      );
    });

    it('getProposedCheckpointL2BlockNumber defaults to checkpointed block number', async () => {
      // Add checkpoint 1 with blocks 1-3
      const checkpoint1 = makePublishedCheckpoint(
        await Checkpoint.random(CheckpointNumber(1), { numBlocks: 3, startBlockNumber: 1 }),
        10,
      );
      await blockStore.addCheckpoints([checkpoint1]);

      // No proposed checkpoint set — should fall back to the checkpointed block number
      const pendingBlockNumber = await blockStore.getProposedCheckpointL2BlockNumber();
      const checkpointedBlockNumber = await blockStore.getCheckpointedL2BlockNumber();
      expect(pendingBlockNumber).toBe(checkpointedBlockNumber);
      expect(pendingBlockNumber).toBe(3);
    });

    it('getProposedCheckpointL2BlockNumber returns pending block number when set', async () => {
      // Add checkpoint 1 with block 1
      const checkpoint1 = makePublishedCheckpoint(
        await Checkpoint.random(CheckpointNumber(1), { numBlocks: 1, startBlockNumber: 1 }),
        10,
      );
      await blockStore.addCheckpoints([checkpoint1]);

      // Add proposed block for proposed checkpoint 2
      await addBlocksForProposedCheckpoint(2, 1, 2, checkpoint1.checkpoint.blocks[0].archive);

      // Set proposed checkpoint
      await blockStore.addProposedCheckpoint({
        checkpointNumber: CheckpointNumber(2),
        header: CheckpointHeader.empty(),
        startBlock: BlockNumber(2),
        blockCount: 1,
        totalManaUsed: 100n,
        feeAssetPriceModifier: 50n,
      });

      // Should return last block of proposed checkpoint (startBlock + blockCount - 1)
      const pendingBlockNumber = await blockStore.getProposedCheckpointL2BlockNumber();
      expect(pendingBlockNumber).toBe(2);
      // And it should be greater than the checkpointed block number
      expect(pendingBlockNumber).toBeGreaterThan(await blockStore.getCheckpointedL2BlockNumber());
    });

    it('getProposedCheckpointL2BlockNumber falls back to checkpointed after pending is cleared', async () => {
      // Add checkpoint 1
      const checkpoint1 = makePublishedCheckpoint(
        await Checkpoint.random(CheckpointNumber(1), { numBlocks: 1, startBlockNumber: 1 }),
        10,
      );
      await blockStore.addCheckpoints([checkpoint1]);

      // Add blocks and set proposed checkpoint 2
      await addBlocksForProposedCheckpoint(2, 1, 2, checkpoint1.checkpoint.blocks[0].archive);
      await blockStore.addProposedCheckpoint({
        checkpointNumber: CheckpointNumber(2),
        header: CheckpointHeader.empty(),
        startBlock: BlockNumber(2),
        blockCount: 1,
        totalManaUsed: 100n,
        feeAssetPriceModifier: 50n,
      });
      expect(await blockStore.getProposedCheckpointL2BlockNumber()).toBe(2);

      // Confirm checkpoint 2 on L1 (clears pending)
      const checkpoint2 = makePublishedCheckpoint(
        await Checkpoint.random(CheckpointNumber(2), {
          numBlocks: 1,
          startBlockNumber: 2,
          previousArchive: checkpoint1.checkpoint.blocks[0].archive,
        }),
        20,
      );
      await blockStore.addCheckpoints([checkpoint2]);

      // Pending cleared — should fall back to the new checkpointed block number
      const pendingBlockNumber = await blockStore.getProposedCheckpointL2BlockNumber();
      const checkpointedBlockNumber = await blockStore.getCheckpointedL2BlockNumber();
      expect(pendingBlockNumber).toBe(checkpointedBlockNumber);
      expect(pendingBlockNumber).toBe(2);
    });
  });

  describe('promoteProposedToCheckpointed', () => {
    async function setupProposedCheckpoint() {
      // Add confirmed checkpoint 1
      const checkpoint1 = makePublishedCheckpoint(
        await Checkpoint.random(CheckpointNumber(1), { numBlocks: 1, startBlockNumber: 1 }),
        10,
      );
      await blockStore.addCheckpoints([checkpoint1]);

      // Add proposed blocks for checkpoint 2
      const block2 = await L2Block.random(BlockNumber(2), {
        checkpointNumber: CheckpointNumber(2),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        lastArchive: checkpoint1.checkpoint.blocks[0].archive,
      });
      await blockStore.addProposedBlock(block2, { force: true });

      // Set proposed checkpoint 2
      await blockStore.addProposedCheckpoint({
        checkpointNumber: CheckpointNumber(2),
        header: CheckpointHeader.empty(),
        startBlock: BlockNumber(2),
        blockCount: 1,
        totalManaUsed: 100n,
        feeAssetPriceModifier: 50n,
      });

      const proposed = await blockStore.getLastProposedCheckpoint();
      return { checkpoint1, proposed: proposed! };
    }

    it('promotes proposed checkpoint to confirmed', async () => {
      const { proposed } = await setupProposedCheckpoint();
      const l1 = makeL1PublishedData(20);
      const attestations = [CommitteeAttestation.random()];

      await blockStore.promoteProposedToCheckpointed(
        proposed.checkpointNumber,
        l1,
        attestations,
        proposed.archive.root,
      );

      expect(await blockStore.hasProposedCheckpoint()).toBe(false);
      expect(await blockStore.getLatestCheckpointNumber()).toBe(2);
    });

    it('throws when no proposed checkpoint exists', async () => {
      await expect(
        blockStore.promoteProposedToCheckpointed(CheckpointNumber(1), makeL1PublishedData(20), [], Fr.random()),
      ).rejects.toThrow('no proposed checkpoint exists');
    });

    it('throws on archive root mismatch', async () => {
      const { proposed } = await setupProposedCheckpoint();

      await expect(
        blockStore.promoteProposedToCheckpointed(proposed.checkpointNumber, makeL1PublishedData(20), [], Fr.random()),
      ).rejects.toThrow('archive root mismatch');

      // Proposed checkpoint should still exist (transaction rolled back)
      expect(await blockStore.hasProposedCheckpoint()).toBe(true);
    });
  });

  describe('L2TipsCache proposedCheckpoint', () => {
    it('returns proposedCheckpoint equal to checkpointed when no pending exists', async () => {
      // Add checkpoint 1 with blocks 1-3
      const checkpoint1 = makePublishedCheckpoint(
        await Checkpoint.random(CheckpointNumber(1), { numBlocks: 3, startBlockNumber: 1 }),
        10,
      );
      await blockStore.addCheckpoints([checkpoint1]);

      const l2TipsCache = new L2TipsCache(blockStore, GENESIS_BLOCK_HEADER_HASH);
      const tips = await l2TipsCache.getL2Tips();

      // proposedCheckpoint should always be defined
      expect(tips.proposedCheckpoint).toBeDefined();
      // With no proposed checkpoint, it should equal the checkpointed tip
      expect(tips.proposedCheckpoint!.block.number).toBe(tips.checkpointed.block.number);
      expect(tips.proposedCheckpoint!.checkpoint.number).toBe(tips.checkpointed.checkpoint.number);
    });

    it('returns proposedCheckpoint ahead of checkpointed when pending is set', async () => {
      // Add checkpoint 1
      const checkpoint1 = makePublishedCheckpoint(
        await Checkpoint.random(CheckpointNumber(1), { numBlocks: 1, startBlockNumber: 1 }),
        10,
      );
      await blockStore.addCheckpoints([checkpoint1]);

      // Add a proposed block for proposed checkpoint 2, chaining from checkpoint 1
      const block2 = await L2Block.random(BlockNumber(2), {
        checkpointNumber: CheckpointNumber(2),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        lastArchive: checkpoint1.checkpoint.blocks[0].archive,
      });
      await blockStore.addProposedBlock(block2, { force: true });

      // Set proposed checkpoint
      await blockStore.addProposedCheckpoint({
        checkpointNumber: CheckpointNumber(2),
        header: CheckpointHeader.empty(),
        startBlock: BlockNumber(2),
        blockCount: 1,
        totalManaUsed: 100n,
        feeAssetPriceModifier: 50n,
      });

      const l2TipsCache = new L2TipsCache(blockStore, GENESIS_BLOCK_HEADER_HASH);
      const tips = await l2TipsCache.getL2Tips();

      expect(tips.proposedCheckpoint).toBeDefined();
      expect(tips.proposedCheckpoint!.block.number).toBeGreaterThan(tips.checkpointed.block.number);
      expect(tips.proposedCheckpoint!.checkpoint.number).toBeGreaterThan(tips.checkpointed.checkpoint.number);
    });
  });

  describe('getProposedCheckpointBySlot', () => {
    async function addBlocksForProposed(
      startBlock: number,
      blockCount: number,
      checkpointNumber: number,
      previousArchive?: AppendOnlyTreeSnapshot,
    ): Promise<void> {
      for (let i = 0; i < blockCount; i++) {
        const opts: Parameters<typeof L2Block.random>[1] = {
          checkpointNumber: CheckpointNumber(checkpointNumber),
          indexWithinCheckpoint: IndexWithinCheckpoint(i),
        };
        if (i === 0 && previousArchive) {
          (opts as any).lastArchive = previousArchive;
        }
        const block = await L2Block.random(BlockNumber(startBlock + i), opts);
        await blockStore.addProposedBlock(block, { force: true });
      }
    }

    it('returns the proposed entry whose header slot matches', async () => {
      await addBlocksForProposed(1, 1, 1);
      const targetSlot = SlotNumber(42);
      await blockStore.addProposedCheckpoint({
        checkpointNumber: CheckpointNumber(1),
        header: CheckpointHeader.random({ slotNumber: targetSlot }),
        startBlock: BlockNumber(1),
        blockCount: 1,
        totalManaUsed: 100n,
        feeAssetPriceModifier: 0n,
      });

      const result = await blockStore.getProposedCheckpointBySlot(targetSlot);
      expect(result).toBeDefined();
      expect(result!.checkpointNumber).toBe(1);
      expect(result!.header.slotNumber).toBe(targetSlot);
    });

    it('returns undefined if no proposed entry has that slot', async () => {
      await addBlocksForProposed(1, 1, 1);
      await blockStore.addProposedCheckpoint({
        checkpointNumber: CheckpointNumber(1),
        header: CheckpointHeader.random({ slotNumber: SlotNumber(10) }),
        startBlock: BlockNumber(1),
        blockCount: 1,
        totalManaUsed: 100n,
        feeAssetPriceModifier: 0n,
      });

      const result = await blockStore.getProposedCheckpointBySlot(SlotNumber(999));
      expect(result).toBeUndefined();
    });

    it('returns undefined when no proposed checkpoints exist', async () => {
      const result = await blockStore.getProposedCheckpointBySlot(SlotNumber(1));
      expect(result).toBeUndefined();
    });
  });

  describe('removeBlocksAfterBlock', () => {
    it('removes blocks with number > given blockNumber', async () => {
      // Create blocks for initial checkpoint
      const block1 = await L2Block.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
      });
      const block2 = await L2Block.random(BlockNumber(2), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(1),
        lastArchive: block1.archive,
      });
      const block3 = await L2Block.random(BlockNumber(3), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(2),
        lastArchive: block2.archive,
      });
      const block4 = await L2Block.random(BlockNumber(4), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(3),
        lastArchive: block3.archive,
      });

      await addProposedBlocks(blockStore, [block1, block2, block3, block4]);
      expect(await blockStore.getLatestL2BlockNumber()).toBe(4);

      // Remove blocks after block 2
      await blockStore.removeBlocksAfter(BlockNumber(2));

      expect(await blockStore.getLatestL2BlockNumber()).toBe(2);
      expect(await blockStore.getBlock({ number: BlockNumber(1) })).toBeDefined();
      expect(await blockStore.getBlock({ number: BlockNumber(2) })).toBeDefined();
      expect(await blockStore.getBlock({ number: BlockNumber(3) })).toBeUndefined();
      expect(await blockStore.getBlock({ number: BlockNumber(4) })).toBeUndefined();
    });

    it('returns the removed blocks', async () => {
      const block1 = await L2Block.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
      });
      const block2 = await L2Block.random(BlockNumber(2), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(1),
        lastArchive: block1.archive,
      });
      const block3 = await L2Block.random(BlockNumber(3), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(2),
        lastArchive: block2.archive,
      });

      await addProposedBlocks(blockStore, [block1, block2, block3]);

      // Remove blocks after block 1
      const removedBlocks = await blockStore.removeBlocksAfter(BlockNumber(1));

      expect(removedBlocks.length).toBe(2);
      expect(removedBlocks[0].equals(block2)).toBe(true);
      expect(removedBlocks[1].equals(block3)).toBe(true);
    });

    it('returns empty array when no blocks need to be removed', async () => {
      const block1 = await L2Block.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
      });
      const block2 = await L2Block.random(BlockNumber(2), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(1),
        lastArchive: block1.archive,
      });

      await addProposedBlocks(blockStore, [block1, block2]);

      // Remove blocks after block 2 (none to remove)
      const removedBlocks = await blockStore.removeBlocksAfter(BlockNumber(2));

      expect(removedBlocks).toEqual([]);
      expect(await blockStore.getLatestL2BlockNumber()).toBe(2);
    });

    it('returns empty array when store is empty', async () => {
      const removedBlocks = await blockStore.removeBlocksAfter(BlockNumber(0));

      expect(removedBlocks).toEqual([]);
    });

    it('cleans up related data (tx effects, hash index, archive index)', async () => {
      const block1 = await L2Block.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
        txsPerBlock: 2,
      });
      const block2 = await L2Block.random(BlockNumber(2), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(1),
        lastArchive: block1.archive,
        txsPerBlock: 2,
      });

      await addProposedBlocks(blockStore, [block1, block2]);

      // Verify block2 is retrievable by hash and archive before removal
      const block2Hash = await block2.header.hash();
      const block2Archive = block2.archive.root;

      expect(await blockStore.getBlock({ hash: block2Hash })).toBeDefined();
      expect(await blockStore.getBlock({ archive: block2Archive })).toBeDefined();

      // Verify tx effects for block2 are retrievable before removal
      for (const txEffect of block2.body.txEffects) {
        const retrieved = await blockStore.getTxEffect(txEffect.txHash);
        expect(retrieved).toBeDefined();
      }

      // Remove blocks after block 1
      await blockStore.removeBlocksAfter(BlockNumber(1));

      // Verify block2 is no longer retrievable by hash or archive
      expect(await blockStore.getBlock({ hash: block2Hash })).toBeUndefined();
      expect(await blockStore.getBlock({ archive: block2Archive })).toBeUndefined();

      // Verify tx effects for block2 are no longer retrievable
      for (const txEffect of block2.body.txEffects) {
        const retrieved = await blockStore.getTxEffect(txEffect.txHash);
        expect(retrieved).toBeUndefined();
      }

      // Verify block1's data is still intact
      const block1Hash = await block1.header.hash();
      const block1Archive = block1.archive.root;

      expect(await blockStore.getBlock({ hash: block1Hash })).toBeDefined();
      expect(await blockStore.getBlock({ archive: block1Archive })).toBeDefined();

      for (const txEffect of block1.body.txEffects) {
        const retrieved = await blockStore.getTxEffect(txEffect.txHash);
        expect(retrieved).toBeDefined();
      }
    });

    it('removes all blocks when blockNumber is 0', async () => {
      const block1 = await L2Block.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
      });
      const block2 = await L2Block.random(BlockNumber(2), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(1),
        lastArchive: block1.archive,
      });

      await addProposedBlocks(blockStore, [block1, block2]);

      const removedBlocks = await blockStore.removeBlocksAfter(BlockNumber(0));

      expect(removedBlocks.length).toBe(2);
      expect(await blockStore.getLatestL2BlockNumber()).toBe(0);
      expect(await blockStore.getBlock({ number: BlockNumber(1) })).toBeUndefined();
      expect(await blockStore.getBlock({ number: BlockNumber(2) })).toBeUndefined();
    });
  });

  describe('rejected checkpoints', () => {
    const makeEntry = (overrides: { archiveRoot?: Fr; l1BlockNumber?: number; checkpointNumber?: number } = {}) => ({
      checkpointNumber: CheckpointNumber(overrides.checkpointNumber ?? 1),
      archiveRoot: overrides.archiveRoot ?? Fr.random(),
      parentArchiveRoot: Fr.random(),
      slotNumber: SlotNumber(1),
      l1: makeL1PublishedData(overrides.l1BlockNumber ?? 100),
      reason: 'invalid-attestations' as const,
    });

    it('returns an empty result when no rejected checkpoints have been recorded', async () => {
      expect(await blockStore.getRejectedCheckpointByArchiveRoot(Fr.random())).toBeUndefined();
      expect(await blockStore.getLatestRejectedCheckpointNumber()).toEqual(
        CheckpointNumber(INITIAL_CHECKPOINT_NUMBER - 1),
      );
    });

    it('round-trips an added rejected entry', async () => {
      const entry = makeEntry();
      await blockStore.addRejectedCheckpoint(entry);

      const stored = await blockStore.getRejectedCheckpointByArchiveRoot(entry.archiveRoot);
      expect(stored).toBeDefined();
      expect(stored!.checkpointNumber).toEqual(entry.checkpointNumber);
      expect(stored!.archiveRoot.toString()).toEqual(entry.archiveRoot.toString());
      expect(stored!.parentArchiveRoot.toString()).toEqual(entry.parentArchiveRoot.toString());
      expect(stored!.slotNumber).toEqual(entry.slotNumber);
      expect(stored!.l1.blockNumber).toEqual(entry.l1.blockNumber);
      expect(stored!.l1.blockHash).toEqual(entry.l1.blockHash);
      expect(stored!.reason).toEqual(entry.reason);
    });

    it('updates an existing entry when re-added with the same archive root', async () => {
      const archiveRoot = Fr.random();
      await blockStore.addRejectedCheckpoint(makeEntry({ archiveRoot, l1BlockNumber: 100 }));
      await blockStore.addRejectedCheckpoint(makeEntry({ archiveRoot, l1BlockNumber: 110 }));

      const stored = await blockStore.getRejectedCheckpointByArchiveRoot(archiveRoot);
      expect(stored).toBeDefined();
      expect(stored!.l1.blockNumber).toEqual(110n);
    });

    it('preserves the descends-from-invalid-attestations reason', async () => {
      const entry = {
        ...makeEntry(),
        reason: 'descends-from-invalid-attestations' as const,
      };
      await blockStore.addRejectedCheckpoint(entry);
      const stored = await blockStore.getRejectedCheckpointByArchiveRoot(entry.archiveRoot);
      expect(stored!.reason).toEqual('descends-from-invalid-attestations');
    });

    it('returns the latest rejected checkpoint number across all entries', async () => {
      await blockStore.addRejectedCheckpoint(makeEntry({ checkpointNumber: 1 }));
      await blockStore.addRejectedCheckpoint(makeEntry({ checkpointNumber: 5 }));
      await blockStore.addRejectedCheckpoint(makeEntry({ checkpointNumber: 3 }));

      expect(await blockStore.getLatestRejectedCheckpointNumber()).toEqual(CheckpointNumber(5));
    });

    it('looks up a rejected entry by checkpoint number', async () => {
      const entry = makeEntry({ checkpointNumber: 7 });
      await blockStore.addRejectedCheckpoint(entry);

      const stored = await blockStore.getRejectedCheckpointByNumber(CheckpointNumber(7));
      expect(stored?.archiveRoot.toString()).toEqual(entry.archiveRoot.toString());
      expect(await blockStore.getRejectedCheckpointByNumber(CheckpointNumber(8))).toBeUndefined();
    });

    it('removes a rejected entry by archive root', async () => {
      const entry = makeEntry({ checkpointNumber: 4 });
      await blockStore.addRejectedCheckpoint(entry);
      expect(await blockStore.getRejectedCheckpointByArchiveRoot(entry.archiveRoot)).toBeDefined();

      await blockStore.removeRejectedCheckpointByArchiveRoot(entry.archiveRoot);
      expect(await blockStore.getRejectedCheckpointByArchiveRoot(entry.archiveRoot)).toBeUndefined();
      expect(await blockStore.getRejectedCheckpointByNumber(CheckpointNumber(4))).toBeUndefined();
      expect(await blockStore.getLatestRejectedCheckpointNumber()).toEqual(
        CheckpointNumber(INITIAL_CHECKPOINT_NUMBER - 1),
      );
    });
  });
});
