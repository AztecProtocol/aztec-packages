import { INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import { BlockNumber, CheckpointNumber, IndexWithinCheckpoint } from '@aztec/foundation/branded-types';
import { randomInt } from '@aztec/foundation/crypto/random';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHash, L2Block } from '@aztec/stdlib/block';
import { Checkpoint, PublishedCheckpoint } from '@aztec/stdlib/checkpoint';
import { MAX_LOGS_PER_TAG } from '@aztec/stdlib/interfaces/api-limit';
import { ContractClassLog, LogId } from '@aztec/stdlib/logs';
import '@aztec/stdlib/testing/jest';
import { TxHash } from '@aztec/stdlib/tx';

import { OutOfOrderLogInsertionError } from '../errors.js';
import {
  makeCheckpointWithLogs,
  makePrivateLog,
  makePrivateLogTag,
  makePublicLog,
  makePublicLogTag,
  makePublishedCheckpoint,
  makeStateForBlock,
} from '../test/mock_structs.js';
import { BlockStore } from './block_store.js';
import { LogStore } from './log_store.js';

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

describe('LogStore', () => {
  let blockStore: BlockStore;
  let logStore: LogStore;
  let publishedCheckpoints: PublishedCheckpoint[];

  beforeEach(async () => {
    const db = await openTmpStore('log_store_test');
    blockStore = new BlockStore(db);
    logStore = new LogStore(db, blockStore, 1000);
    // Create checkpoints sequentially to ensure archive roots are chained properly.
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
        txOptions: { numPublicCallsPerTx: 2, numPublicLogsPerCall: 2 },
      });
      publishedCheckpoints.push(makePublishedCheckpoint(checkpoint, i + 10));
    }
  });

  describe('addLogs', () => {
    it('adds private & public logs', async () => {
      const checkpoint = publishedCheckpoints[0];
      await blockStore.addCheckpoints([checkpoint]);
      await expect(logStore.addLogs(checkpoint.checkpoint.blocks)).resolves.toEqual(true);
    });
  });

  describe('deleteLogs', () => {
    it('deletes public logs for a block', async () => {
      const block = publishedCheckpoints[0].checkpoint.blocks[0];
      await blockStore.addProposedBlock(block);
      await expect(logStore.addLogs([block])).resolves.toEqual(true);

      expect((await logStore.getPublicLogs({ fromBlock: BlockNumber(1) })).logs.length).toEqual(
        block.body.txEffects.map(txEffect => txEffect.publicLogs).flat().length,
      );

      await logStore.deleteLogs([block]);

      expect((await logStore.getPublicLogs({ fromBlock: BlockNumber(1) })).logs.length).toEqual(0);
    });

    it('deletes contract class logs for a block', async () => {
      // Create a block that explicitly has contract class logs
      const block = await L2Block.random(BlockNumber(1), {
        txsPerBlock: 2,
        txOptions: { numContractClassLogs: 1 },
        state: makeStateForBlock(1, 2),
      });
      await blockStore.addProposedBlock(block);
      await logStore.addLogs([block]);

      const logsBefore = await logStore.getContractClassLogs({ fromBlock: BlockNumber(1) });
      expect(logsBefore.logs.length).toBeGreaterThan(0);

      await logStore.deleteLogs([block]);

      const logsAfter = await logStore.getContractClassLogs({ fromBlock: BlockNumber(1) });
      expect(logsAfter.logs.length).toEqual(0);
    });

    it('retains private logs from non-reorged block when same tag appears in reorged block', async () => {
      const sharedTag = makePrivateLogTag(1, 0, 0);

      // Block 1 with a private log using sharedTag
      const cp1 = await makeCheckpointWithLogs(1, {
        numTxsPerBlock: 1,
        privateLogs: { numLogsPerTx: 1 },
      });
      const block1 = cp1.checkpoint.blocks[0];

      // Block 2 with a private log using the SAME tag
      const cp2 = await makeCheckpointWithLogs(2, {
        previousArchive: block1.archive,
        numTxsPerBlock: 1,
        privateLogs: { numLogsPerTx: 1 },
      });
      const block2 = cp2.checkpoint.blocks[0];
      // Override block2's private log tag to match block1's
      block2.body.txEffects[0].privateLogs[0] = makePrivateLog(sharedTag);

      await addProposedBlocks(blockStore, [block1, block2], { force: true });
      await logStore.addLogs([block1, block2]);

      // Both blocks' logs should be present
      const logsBefore = await logStore.getPrivateLogsByTags([sharedTag]);
      expect(logsBefore[0]).toHaveLength(2);

      // Reorg: delete block 2
      await logStore.deleteLogs([block2]);

      // Block 1's log should still be present
      const logsAfter = await logStore.getPrivateLogsByTags([sharedTag]);
      expect(logsAfter[0]).toHaveLength(1);
      expect(logsAfter[0][0].blockNumber).toEqual(1);
    });

    it('retains public logs from non-reorged block when same tag appears in reorged block', async () => {
      const contractAddress = AztecAddress.fromNumber(543254);
      const sharedTag = makePublicLogTag(1, 0, 0);

      // Block 1 with a public log using sharedTag
      const cp1 = await makeCheckpointWithLogs(1, {
        numTxsPerBlock: 1,
        publicLogs: { numLogsPerTx: 1, contractAddress },
      });
      const block1 = cp1.checkpoint.blocks[0];

      // Block 2 with a public log using the SAME tag from the same contract
      const cp2 = await makeCheckpointWithLogs(2, {
        previousArchive: block1.archive,
        numTxsPerBlock: 1,
        publicLogs: { numLogsPerTx: 1, contractAddress },
      });
      const block2 = cp2.checkpoint.blocks[0];
      // Override block2's public log tag to match block1's
      block2.body.txEffects[0].publicLogs[0] = makePublicLog(sharedTag, contractAddress);

      await addProposedBlocks(blockStore, [block1, block2], { force: true });
      await logStore.addLogs([block1, block2]);

      // Both blocks' logs should be present
      const logsBefore = await logStore.getPublicLogsByTagsFromContract(contractAddress, [sharedTag]);
      expect(logsBefore[0]).toHaveLength(2);

      // Reorg: delete block 2
      await logStore.deleteLogs([block2]);

      // Block 1's log should still be present
      const logsAfter = await logStore.getPublicLogsByTagsFromContract(contractAddress, [sharedTag]);
      expect(logsAfter[0]).toHaveLength(1);
      expect(logsAfter[0][0].blockNumber).toEqual(1);
    });

    it('deletes multiple blocks at once', async () => {
      const cp1 = await makeCheckpointWithLogs(1, {
        numTxsPerBlock: 2,
        privateLogs: { numLogsPerTx: 1 },
        publicLogs: { numLogsPerTx: 1 },
      });
      const block1 = cp1.checkpoint.blocks[0];

      const cp2 = await makeCheckpointWithLogs(2, {
        previousArchive: block1.archive,
        numTxsPerBlock: 2,
        privateLogs: { numLogsPerTx: 1 },
        publicLogs: { numLogsPerTx: 1 },
      });
      const block2 = cp2.checkpoint.blocks[0];

      await addProposedBlocks(blockStore, [block1, block2], { force: true });
      await logStore.addLogs([block1, block2]);

      // Verify logs exist
      expect((await logStore.getPublicLogs({ fromBlock: BlockNumber(1) })).logs.length).toBeGreaterThan(0);

      // Delete both blocks at once
      await logStore.deleteLogs([block1, block2]);

      expect((await logStore.getPublicLogs({ fromBlock: BlockNumber(1) })).logs.length).toEqual(0);
    });

    it('is a no-op when deleting blocks with no logs', async () => {
      const block = publishedCheckpoints[0].checkpoint.blocks[0];
      // Don't add logs, just try to delete
      await expect(logStore.deleteLogs([block])).resolves.toEqual(true);
    });
  });

  describe('getPrivateLogsByTags', () => {
    const numBlocksForLogs = 3;
    const numTxsPerBlock = 4;
    const numPrivateLogsPerTx = 3;

    let logsCheckpoints: PublishedCheckpoint[];

    beforeEach(async () => {
      // Create checkpoints sequentially to chain archive roots
      logsCheckpoints = [];
      for (let i = 0; i < numBlocksForLogs; i++) {
        const previousArchive = i > 0 ? logsCheckpoints[i - 1].checkpoint.blocks[0].archive : undefined;
        logsCheckpoints.push(
          await makeCheckpointWithLogs(i + 1, {
            previousArchive,
            numTxsPerBlock,
            privateLogs: { numLogsPerTx: numPrivateLogsPerTx },
          }),
        );
      }

      await blockStore.addCheckpoints(logsCheckpoints);
      await logStore.addLogs(logsCheckpoints.flatMap(p => p.checkpoint.blocks));
    });

    it('is possible to batch request private logs via tags', async () => {
      const tags = [makePrivateLogTag(2, 1, 2), makePrivateLogTag(1, 2, 0)];

      const logsByTags = await logStore.getPrivateLogsByTags(tags);

      expect(logsByTags).toEqual([
        [
          expect.objectContaining({
            blockNumber: 2,
            logData: makePrivateLog(tags[0]).getEmittedFields(),
          }),
        ],
        [
          expect.objectContaining({
            blockNumber: 1,
            logData: makePrivateLog(tags[1]).getEmittedFields(),
          }),
        ],
      ]);
    });

    it('is possible to batch request logs that have the same tag but different content', async () => {
      const tags = [makePrivateLogTag(1, 2, 1)];

      // Create a checkpoint containing logs that have the same tag as the checkpoints before.
      // Chain from the last checkpoint's archive
      const newBlockNumber = numBlocksForLogs + 1;
      const previousArchive = logsCheckpoints[logsCheckpoints.length - 1].checkpoint.blocks[0].archive;
      const newCheckpoint = await makeCheckpointWithLogs(newBlockNumber, {
        previousArchive,
        numTxsPerBlock,
        privateLogs: { numLogsPerTx: numPrivateLogsPerTx },
      });
      const newLog = newCheckpoint.checkpoint.blocks[0].body.txEffects[1].privateLogs[1];
      newLog.fields[0] = tags[0].value;
      newCheckpoint.checkpoint.blocks[0].body.txEffects[1].privateLogs[1] = newLog;
      await blockStore.addCheckpoints([newCheckpoint]);
      await logStore.addLogs([newCheckpoint.checkpoint.blocks[0]]);

      const logsByTags = await logStore.getPrivateLogsByTags(tags);

      expect(logsByTags).toEqual([
        [
          expect.objectContaining({
            blockNumber: 1,
            logData: makePrivateLog(tags[0]).getEmittedFields(),
          }),
          expect.objectContaining({
            blockNumber: newBlockNumber,
            logData: newLog.getEmittedFields(),
          }),
        ],
      ]);
    });

    it('throws on out-of-order private log insertion', async () => {
      const sharedTag = makePrivateLogTag(99, 0, 0);

      // Create blocks 4 and 5 with the same shared tag
      const prevArchive1 = logsCheckpoints[logsCheckpoints.length - 1].checkpoint.blocks[0].archive;
      const checkpoint4 = await makeCheckpointWithLogs(numBlocksForLogs + 1, {
        previousArchive: prevArchive1,
        numTxsPerBlock,
        privateLogs: { numLogsPerTx: numPrivateLogsPerTx },
      });
      checkpoint4.checkpoint.blocks[0].body.txEffects[0].privateLogs[0] = makePrivateLog(sharedTag);

      const prevArchive2 = checkpoint4.checkpoint.blocks[0].archive;
      const checkpoint5 = await makeCheckpointWithLogs(numBlocksForLogs + 2, {
        previousArchive: prevArchive2,
        numTxsPerBlock,
        privateLogs: { numLogsPerTx: numPrivateLogsPerTx },
      });
      checkpoint5.checkpoint.blocks[0].body.txEffects[0].privateLogs[0] = makePrivateLog(sharedTag);

      // Store block 5's logs first (higher block number), then try to store block 4's logs
      // (lower block number) — this should fail.
      await logStore.addLogs([checkpoint5.checkpoint.blocks[0]]);
      await expect(logStore.addLogs([checkpoint4.checkpoint.blocks[0]])).rejects.toThrow(OutOfOrderLogInsertionError);
    });

    it('is possible to request logs for non-existing tags and determine their position', async () => {
      const tags = [makePrivateLogTag(99, 88, 77), makePrivateLogTag(1, 1, 1)];

      const logsByTags = await logStore.getPrivateLogsByTags(tags);

      expect(logsByTags).toEqual([
        [
          // No logs for the first tag.
        ],
        [
          expect.objectContaining({
            blockNumber: 1,
            logData: makePrivateLog(tags[1]).getEmittedFields(),
          }),
        ],
      ]);
    });

    it('filters logs up to specified block number', async () => {
      // Tags are unique per block, so create a shared tag across blocks by adding logs with the same tag
      const sharedTag = makePrivateLogTag(1, 2, 1);

      // Add extra blocks with logs sharing the same tag
      for (let blockNum = numBlocksForLogs + 1; blockNum <= numBlocksForLogs + 2; blockNum++) {
        const previousArchive = logsCheckpoints[logsCheckpoints.length - 1].checkpoint.blocks[0].archive;
        const newCheckpoint = await makeCheckpointWithLogs(blockNum, {
          previousArchive,
          numTxsPerBlock,
          privateLogs: { numLogsPerTx: numPrivateLogsPerTx },
        });
        const newLog = newCheckpoint.checkpoint.blocks[0].body.txEffects[1].privateLogs[1];
        newLog.fields[0] = sharedTag.value;
        newCheckpoint.checkpoint.blocks[0].body.txEffects[1].privateLogs[1] = newLog;
        await blockStore.addCheckpoints([newCheckpoint]);
        await logStore.addLogs([newCheckpoint.checkpoint.blocks[0]]);
        logsCheckpoints.push(newCheckpoint);
      }

      // Without filter, should return logs from block 1 and the extra blocks
      const allLogs = await logStore.getPrivateLogsByTags([sharedTag]);
      expect(allLogs[0].some(log => log.blockNumber > numBlocksForLogs)).toBe(true);

      // With upToBlockNumber=numBlocksForLogs, should only return the original log from block 1
      const filteredLogs = await logStore.getPrivateLogsByTags([sharedTag], 0, BlockNumber(numBlocksForLogs));
      expect(filteredLogs[0].length).toBeGreaterThan(0);
      for (const log of filteredLogs[0]) {
        expect(log.blockNumber).toBeLessThanOrEqual(numBlocksForLogs);
      }
      expect(filteredLogs[0].length).toBeLessThan(allLogs[0].length);
    });

    it('returns all logs when upToBlockNumber is not set', async () => {
      const tag = makePrivateLogTag(1, 2, 1);

      const logsWithoutFilter = await logStore.getPrivateLogsByTags([tag]);
      const logsWithUndefined = await logStore.getPrivateLogsByTags([tag], 0, undefined);

      expect(logsWithoutFilter).toEqual(logsWithUndefined);
    });

    describe('pagination', () => {
      const paginationTag = makePrivateLogTag(1, 2, 1);

      beforeEach(async () => {
        // Add more blocks with the same tag to exceed MAX_LOGS_PER_TAG
        for (let i = numBlocksForLogs; i < numBlocksForLogs + MAX_LOGS_PER_TAG + 5; i++) {
          const previousArchive = logsCheckpoints[logsCheckpoints.length - 1].checkpoint.blocks[0].archive;
          const newCheckpoint = await makeCheckpointWithLogs(i + 1, {
            previousArchive,
            numTxsPerBlock,
            privateLogs: { numLogsPerTx: numPrivateLogsPerTx },
          });
          const newLog = newCheckpoint.checkpoint.blocks[0].body.txEffects[1].privateLogs[1];
          newLog.fields[0] = paginationTag.value;
          newCheckpoint.checkpoint.blocks[0].body.txEffects[1].privateLogs[1] = newLog;
          await blockStore.addCheckpoints([newCheckpoint]);
          await logStore.addLogs([newCheckpoint.checkpoint.blocks[0]]);
          logsCheckpoints.push(newCheckpoint);
        }
      });

      it('pagination works correctly with upToBlockNumber', async () => {
        // With a low upToBlockNumber, the filtered set should be smaller than MAX_LOGS_PER_TAG
        const filteredPage0 = await logStore.getPrivateLogsByTags([paginationTag], 0, BlockNumber(5));
        for (const log of filteredPage0[0]) {
          expect(log.blockNumber).toBeLessThanOrEqual(5);
        }

        // Page 1 with the same filter should only contain remaining filtered logs
        const filteredPage1 = await logStore.getPrivateLogsByTags([paginationTag], 1, BlockNumber(5));
        for (const log of filteredPage1[0]) {
          expect(log.blockNumber).toBeLessThanOrEqual(5);
        }
      });

      it('returns first page of logs when page=0', async () => {
        const logsByTags = await logStore.getPrivateLogsByTags([paginationTag], 0);

        expect(logsByTags[0]).toHaveLength(MAX_LOGS_PER_TAG);
        expect(logsByTags[0][0].blockNumber).toBe(1); // First log from block 1
      });

      it('returns second page of logs when page=1', async () => {
        const logsByTags = await logStore.getPrivateLogsByTags([paginationTag], 1);

        // Should have the remaining logs (total was MAX_LOGS_PER_TAG + 6, so page 1 has 6)
        expect(logsByTags[0]).toHaveLength(6);
      });

      it('returns empty array when page is beyond available logs', async () => {
        const logsByTags = await logStore.getPrivateLogsByTags([paginationTag], 100);

        expect(logsByTags).toEqual([[]]);
      });

      /**
       * Verifies that logs are stored and returned in block order (ascending).
       * This ordering guarantee is critical for pagination safety: if logs were not ordered
       * by block number, new logs added between paginated calls could be inserted in the
       * middle of the result set, causing callers to receive duplicate logs or miss logs
       * entirely. By maintaining block order, new logs always appear at the end of the
       * result set, meaning previously fetched pages remain stable.
       */
      it('maintains stable pagination when new logs are added between page fetches', async () => {
        // Fetch page 0 and record the block numbers
        const page0Before = await logStore.getPrivateLogsByTags([paginationTag], 0);
        expect(page0Before[0]).toHaveLength(MAX_LOGS_PER_TAG);
        const blockNumbersBefore = page0Before[0].map(log => log.blockNumber);

        // Verify block numbers are in ascending order
        for (let i = 1; i < blockNumbersBefore.length; i++) {
          expect(blockNumbersBefore[i]).toBeGreaterThanOrEqual(blockNumbersBefore[i - 1]);
        }

        // Add more blocks with the same tag
        const additionalBlocks = 3;
        for (let i = 0; i < additionalBlocks; i++) {
          const previousArchive = logsCheckpoints[logsCheckpoints.length - 1].checkpoint.blocks[0].archive;
          const blockNumber = logsCheckpoints.length + 1;
          const newCheckpoint = await makeCheckpointWithLogs(blockNumber, {
            previousArchive,
            numTxsPerBlock,
            privateLogs: { numLogsPerTx: numPrivateLogsPerTx },
          });
          const newLog = newCheckpoint.checkpoint.blocks[0].body.txEffects[1].privateLogs[1];
          newLog.fields[0] = paginationTag.value;
          newCheckpoint.checkpoint.blocks[0].body.txEffects[1].privateLogs[1] = newLog;
          await blockStore.addCheckpoints([newCheckpoint]);
          await logStore.addLogs([newCheckpoint.checkpoint.blocks[0]]);
          logsCheckpoints.push(newCheckpoint);
        }

        // Fetch page 0 again - should return the exact same logs
        const page0After = await logStore.getPrivateLogsByTags([paginationTag], 0);
        expect(page0After[0]).toHaveLength(MAX_LOGS_PER_TAG);
        const blockNumbersAfter = page0After[0].map(log => log.blockNumber);
        expect(blockNumbersAfter).toEqual(blockNumbersBefore);

        // Fetch page 1 - should include the newly added logs
        const page1 = await logStore.getPrivateLogsByTags([paginationTag], 1);
        expect(page1[0].length).toBeGreaterThan(0);

        // Verify all logs across both pages are in ascending block order
        const allBlockNumbers = [...blockNumbersAfter, ...page1[0].map(log => log.blockNumber)];
        for (let i = 1; i < allBlockNumbers.length; i++) {
          expect(allBlockNumbers[i]).toBeGreaterThanOrEqual(allBlockNumbers[i - 1]);
        }

        // The new logs should appear on page 1, meaning their block numbers
        // should be greater than or equal to the max block number on page 0
        const maxBlockOnPage0 = Math.max(...blockNumbersAfter);
        const newLogBlockNumbers = page1[0].slice(-additionalBlocks).map(log => log.blockNumber);
        for (const blockNum of newLogBlockNumbers) {
          expect(blockNum).toBeGreaterThanOrEqual(maxBlockOnPage0);
        }
      });
    });
  });

  // Note that a lot of tests here are basically duplicates of the ones in getPrivateLogsByTags but the types used
  // by each of the endpoints are different and that makes improving code reuse here not straightforward.

  describe('getPublicLogsByTagsFromContract', () => {
    const numBlocksForLogs = 3;
    const numTxsPerBlock = 4;
    const numPublicLogsPerTx = 2;
    const contractAddress = AztecAddress.fromNumber(543254);

    let logsCheckpoints: PublishedCheckpoint[];

    beforeEach(async () => {
      // Create checkpoints sequentially to chain archive roots
      logsCheckpoints = [];
      for (let i = 0; i < numBlocksForLogs; i++) {
        const previousArchive = i > 0 ? logsCheckpoints[i - 1].checkpoint.blocks[0].archive : undefined;
        logsCheckpoints.push(
          await makeCheckpointWithLogs(i + 1, {
            previousArchive,
            numTxsPerBlock,
            publicLogs: { numLogsPerTx: numPublicLogsPerTx, contractAddress },
          }),
        );
      }

      await blockStore.addCheckpoints(logsCheckpoints);
      await logStore.addLogs(logsCheckpoints.flatMap(p => p.checkpoint.blocks));
    });

    it('is possible to batch request public logs via tags', async () => {
      const tags = [makePublicLogTag(2, 1, 1), makePublicLogTag(1, 2, 0)];

      const logsByTags = await logStore.getPublicLogsByTagsFromContract(contractAddress, tags);

      expect(logsByTags).toEqual([
        [
          expect.objectContaining({
            blockNumber: 2,
            logData: makePublicLog(tags[0]).getEmittedFields(),
          }),
        ],
        [
          expect.objectContaining({
            blockNumber: 1,
            logData: makePublicLog(tags[1]).getEmittedFields(),
          }),
        ],
      ]);
    });

    it('is possible to batch request logs that have the same tag but different content', async () => {
      const tags = [makePublicLogTag(1, 2, 1)];

      // Create a checkpoint containing logs that have the same tag as the checkpoints before.
      // Chain from the last checkpoint's archive
      const newBlockNumber = numBlocksForLogs + 1;
      const previousArchive = logsCheckpoints[logsCheckpoints.length - 1].checkpoint.blocks[0].archive;
      const newCheckpoint = await makeCheckpointWithLogs(newBlockNumber, {
        previousArchive,
        numTxsPerBlock,
        publicLogs: { numLogsPerTx: numPublicLogsPerTx, contractAddress },
      });
      const newLog = newCheckpoint.checkpoint.blocks[0].body.txEffects[1].publicLogs[1];
      newLog.fields[0] = tags[0].value;
      newCheckpoint.checkpoint.blocks[0].body.txEffects[1].publicLogs[1] = newLog;
      await blockStore.addCheckpoints([newCheckpoint]);
      await logStore.addLogs([newCheckpoint.checkpoint.blocks[0]]);

      const logsByTags = await logStore.getPublicLogsByTagsFromContract(contractAddress, tags);

      expect(logsByTags).toEqual([
        [
          expect.objectContaining({
            blockNumber: 1,
            logData: makePublicLog(tags[0]).getEmittedFields(),
          }),
          expect.objectContaining({
            blockNumber: newBlockNumber,
            logData: newLog.getEmittedFields(),
          }),
        ],
      ]);
    });

    it('throws on out-of-order public log insertion', async () => {
      const sharedTag = makePublicLogTag(99, 0, 0);

      // Create blocks 4 and 5 with the same shared tag
      const prevArchive1 = logsCheckpoints[logsCheckpoints.length - 1].checkpoint.blocks[0].archive;
      const checkpoint4 = await makeCheckpointWithLogs(numBlocksForLogs + 1, {
        previousArchive: prevArchive1,
        numTxsPerBlock,
        publicLogs: { numLogsPerTx: numPublicLogsPerTx, contractAddress },
      });
      checkpoint4.checkpoint.blocks[0].body.txEffects[0].publicLogs[0] = makePublicLog(sharedTag, contractAddress);

      const prevArchive2 = checkpoint4.checkpoint.blocks[0].archive;
      const checkpoint5 = await makeCheckpointWithLogs(numBlocksForLogs + 2, {
        previousArchive: prevArchive2,
        numTxsPerBlock,
        publicLogs: { numLogsPerTx: numPublicLogsPerTx, contractAddress },
      });
      checkpoint5.checkpoint.blocks[0].body.txEffects[0].publicLogs[0] = makePublicLog(sharedTag, contractAddress);

      // Store block 5's logs first (higher block number), then try to store block 4's logs
      // (lower block number) — this should fail.
      await logStore.addLogs([checkpoint5.checkpoint.blocks[0]]);
      await expect(logStore.addLogs([checkpoint4.checkpoint.blocks[0]])).rejects.toThrow(OutOfOrderLogInsertionError);
    });

    it('is possible to request logs for non-existing tags and determine their position', async () => {
      const tags = [makePublicLogTag(99, 88, 77), makePublicLogTag(1, 1, 0)];

      const logsByTags = await logStore.getPublicLogsByTagsFromContract(contractAddress, tags);

      expect(logsByTags).toEqual([
        [
          // No logs for the first tag.
        ],
        [
          expect.objectContaining({
            blockNumber: 1,
            logData: makePublicLog(tags[1]).getEmittedFields(),
          }),
        ],
      ]);
    });

    it('filters logs up to specified block number', async () => {
      const sharedTag = makePublicLogTag(1, 2, 1);

      // Add extra blocks with logs sharing the same tag
      for (let blockNum = numBlocksForLogs + 1; blockNum <= numBlocksForLogs + 2; blockNum++) {
        const previousArchive = logsCheckpoints[logsCheckpoints.length - 1].checkpoint.blocks[0].archive;
        const newCheckpoint = await makeCheckpointWithLogs(blockNum, {
          previousArchive,
          numTxsPerBlock,
          publicLogs: { numLogsPerTx: numPublicLogsPerTx, contractAddress },
        });
        const newLog = newCheckpoint.checkpoint.blocks[0].body.txEffects[1].publicLogs[1];
        newLog.fields[0] = sharedTag.value;
        newCheckpoint.checkpoint.blocks[0].body.txEffects[1].publicLogs[1] = newLog;
        await blockStore.addCheckpoints([newCheckpoint]);
        await logStore.addLogs([newCheckpoint.checkpoint.blocks[0]]);
        logsCheckpoints.push(newCheckpoint);
      }

      // Without filter, should return logs from block 1 and the extra blocks
      const allLogs = await logStore.getPublicLogsByTagsFromContract(contractAddress, [sharedTag]);
      expect(allLogs[0].some(log => log.blockNumber > numBlocksForLogs)).toBe(true);

      // With upToBlockNumber=numBlocksForLogs, should only return the original log from block 1
      const filteredLogs = await logStore.getPublicLogsByTagsFromContract(
        contractAddress,
        [sharedTag],
        0,
        BlockNumber(numBlocksForLogs),
      );
      expect(filteredLogs[0].length).toBeGreaterThan(0);
      for (const log of filteredLogs[0]) {
        expect(log.blockNumber).toBeLessThanOrEqual(numBlocksForLogs);
      }
      expect(filteredLogs[0].length).toBeLessThan(allLogs[0].length);
    });

    it('returns all logs when upToBlockNumber is not set', async () => {
      const tag = makePublicLogTag(1, 2, 1);

      const logsWithoutFilter = await logStore.getPublicLogsByTagsFromContract(contractAddress, [tag]);
      const logsWithUndefined = await logStore.getPublicLogsByTagsFromContract(contractAddress, [tag], 0, undefined);

      expect(logsWithoutFilter).toEqual(logsWithUndefined);
    });

    describe('pagination', () => {
      const paginationTag = makePublicLogTag(1, 2, 1);

      beforeEach(async () => {
        // Add more blocks with the same tag to exceed MAX_LOGS_PER_TAG
        for (let i = numBlocksForLogs; i < numBlocksForLogs + MAX_LOGS_PER_TAG + 5; i++) {
          const previousArchive = logsCheckpoints[logsCheckpoints.length - 1].checkpoint.blocks[0].archive;
          const newCheckpoint = await makeCheckpointWithLogs(i + 1, {
            previousArchive,
            numTxsPerBlock,
            publicLogs: { numLogsPerTx: numPublicLogsPerTx, contractAddress },
          });
          const newLog = newCheckpoint.checkpoint.blocks[0].body.txEffects[1].publicLogs[1];
          newLog.fields[0] = paginationTag.value;
          newCheckpoint.checkpoint.blocks[0].body.txEffects[1].publicLogs[1] = newLog;
          await blockStore.addCheckpoints([newCheckpoint]);
          await logStore.addLogs([newCheckpoint.checkpoint.blocks[0]]);
          logsCheckpoints.push(newCheckpoint);
        }
      });

      it('pagination works correctly with upToBlockNumber', async () => {
        const filteredPage0 = await logStore.getPublicLogsByTagsFromContract(
          contractAddress,
          [paginationTag],
          0,
          BlockNumber(5),
        );
        for (const log of filteredPage0[0]) {
          expect(log.blockNumber).toBeLessThanOrEqual(5);
        }

        const filteredPage1 = await logStore.getPublicLogsByTagsFromContract(
          contractAddress,
          [paginationTag],
          1,
          BlockNumber(5),
        );
        for (const log of filteredPage1[0]) {
          expect(log.blockNumber).toBeLessThanOrEqual(5);
        }
      });

      it('returns first page of logs when page=0', async () => {
        const logsByTags = await logStore.getPublicLogsByTagsFromContract(contractAddress, [paginationTag], 0);

        expect(logsByTags[0]).toHaveLength(MAX_LOGS_PER_TAG);
        expect(logsByTags[0][0].blockNumber).toBe(1); // First log from block 1
      });

      it('returns second page of logs when page=1', async () => {
        const logsByTags = await logStore.getPublicLogsByTagsFromContract(contractAddress, [paginationTag], 1);

        // Should have the remaining logs (total was MAX_LOGS_PER_TAG + 6, so page 1 has 6)
        expect(logsByTags[0]).toHaveLength(6);
      });

      it('returns empty array when page is beyond available logs', async () => {
        const logsByTags = await logStore.getPublicLogsByTagsFromContract(contractAddress, [paginationTag], 100);

        expect(logsByTags).toEqual([[]]);
      });

      /**
       * Verifies that logs are stored and returned in block order (ascending).
       * This ordering guarantee is critical for pagination safety: if logs were not ordered
       * by block number, new logs added between paginated calls could be inserted in the
       * middle of the result set, causing callers to receive duplicate logs or miss logs
       * entirely. By maintaining block order, new logs always appear at the end of the
       * result set, meaning previously fetched pages remain stable.
       */
      it('maintains stable pagination when new logs are added between page fetches', async () => {
        // Fetch page 0 and record the block numbers
        const page0Before = await logStore.getPublicLogsByTagsFromContract(contractAddress, [paginationTag], 0);
        expect(page0Before[0]).toHaveLength(MAX_LOGS_PER_TAG);
        const blockNumbersBefore = page0Before[0].map(log => log.blockNumber);

        // Verify block numbers are in ascending order
        for (let i = 1; i < blockNumbersBefore.length; i++) {
          expect(blockNumbersBefore[i]).toBeGreaterThanOrEqual(blockNumbersBefore[i - 1]);
        }

        // Add more blocks with the same tag
        const additionalBlocks = 3;
        for (let i = 0; i < additionalBlocks; i++) {
          const previousArchive = logsCheckpoints[logsCheckpoints.length - 1].checkpoint.blocks[0].archive;
          const blockNumber = logsCheckpoints.length + 1;
          const newCheckpoint = await makeCheckpointWithLogs(blockNumber, {
            previousArchive,
            numTxsPerBlock,
            publicLogs: { numLogsPerTx: numPublicLogsPerTx, contractAddress },
          });
          const newLog = newCheckpoint.checkpoint.blocks[0].body.txEffects[1].publicLogs[1];
          newLog.fields[0] = paginationTag.value;
          newCheckpoint.checkpoint.blocks[0].body.txEffects[1].publicLogs[1] = newLog;
          await blockStore.addCheckpoints([newCheckpoint]);
          await logStore.addLogs([newCheckpoint.checkpoint.blocks[0]]);
          logsCheckpoints.push(newCheckpoint);
        }

        // Fetch page 0 again - should return the exact same logs
        const page0After = await logStore.getPublicLogsByTagsFromContract(contractAddress, [paginationTag], 0);
        expect(page0After[0]).toHaveLength(MAX_LOGS_PER_TAG);
        const blockNumbersAfter = page0After[0].map(log => log.blockNumber);
        expect(blockNumbersAfter).toEqual(blockNumbersBefore);

        // Fetch page 1 - should include the newly added logs
        const page1 = await logStore.getPublicLogsByTagsFromContract(contractAddress, [paginationTag], 1);
        expect(page1[0].length).toBeGreaterThan(0);

        // Verify all logs across both pages are in ascending block order
        const allBlockNumbers = [...blockNumbersAfter, ...page1[0].map(log => log.blockNumber)];
        for (let i = 1; i < allBlockNumbers.length; i++) {
          expect(allBlockNumbers[i]).toBeGreaterThanOrEqual(allBlockNumbers[i - 1]);
        }

        // The new logs should appear on page 1, meaning their block numbers
        // should be greater than or equal to the max block number on page 0
        const maxBlockOnPage0 = Math.max(...blockNumbersAfter);
        const newLogBlockNumbers = page1[0].slice(-additionalBlocks).map(log => log.blockNumber);
        for (const blockNum of newLogBlockNumbers) {
          expect(blockNum).toBeGreaterThanOrEqual(maxBlockOnPage0);
        }
      });
    });
  });

  describe('getPublicLogs', () => {
    const numBlocksForPublicLogs = 10;

    // Helper to get total public logs per tx from a block
    const getPublicLogsPerTx = (block: L2Block, txIndex: number) => block.body.txEffects[txIndex].publicLogs.length;

    // Helper to get number of txs in a block
    const getTxsPerBlock = (block: L2Block) => block.body.txEffects.length;

    beforeEach(async () => {
      // Use the outer publishedCheckpoints for log tests
      for (let i = 0; i < numBlocksForPublicLogs; i++) {
        await blockStore.addCheckpoints([publishedCheckpoints[i]]);
        await logStore.addLogs(publishedCheckpoints[i].checkpoint.blocks);
      }
    });

    it('no logs returned if deleted ("txHash" filter param is respected variant)', async () => {
      // get random tx
      const targetBlockIndex = randomInt(numBlocksForPublicLogs);
      const targetBlock = publishedCheckpoints[targetBlockIndex].checkpoint.blocks[0];
      const targetTxIndex = randomInt(getTxsPerBlock(targetBlock));
      const targetTxHash = targetBlock.body.txEffects[targetTxIndex].txHash;

      await Promise.all([
        blockStore.removeCheckpointsAfter(CheckpointNumber(0)),
        logStore.deleteLogs(publishedCheckpoints.slice(0, numBlocksForPublicLogs).flatMap(b => b.checkpoint.blocks)),
      ]);

      const response = await logStore.getPublicLogs({ txHash: targetTxHash });
      const logs = response.logs;

      expect(response.maxLogsHit).toBeFalsy();
      expect(logs.length).toEqual(0);
    });

    it('"txHash" filter param is respected', async () => {
      // get random tx
      const targetBlockIndex = randomInt(numBlocksForPublicLogs);
      const targetBlock = publishedCheckpoints[targetBlockIndex].checkpoint.blocks[0];
      const targetTxIndex = randomInt(getTxsPerBlock(targetBlock));
      const targetTxHash = targetBlock.body.txEffects[targetTxIndex].txHash;

      const response = await logStore.getPublicLogs({ txHash: targetTxHash });
      const logs = response.logs;

      expect(response.maxLogsHit).toBeFalsy();

      const expectedNumLogs = getPublicLogsPerTx(targetBlock, targetTxIndex);
      expect(logs.length).toEqual(expectedNumLogs);

      const targeBlockNumber = targetBlockIndex + INITIAL_L2_BLOCK_NUM;
      for (const log of logs) {
        expect(log.id.blockNumber).toEqual(targeBlockNumber);
        expect(log.id.txIndex).toEqual(targetTxIndex);
      }
    });

    it('returns block hash on public log ids', async () => {
      const targetBlock = publishedCheckpoints[0].checkpoint.blocks[0];
      const expectedBlockHash = await targetBlock.header.hash();

      const logs = (await logStore.getPublicLogs({ fromBlock: targetBlock.number, toBlock: targetBlock.number + 1 }))
        .logs;

      expect(logs.length).toBeGreaterThan(0);
      expect(logs.every(log => log.id.blockHash.equals(expectedBlockHash))).toBe(true);
    });

    it('returns tx hash on public log ids', async () => {
      const targetBlock = publishedCheckpoints[0].checkpoint.blocks[0];

      const logs = (await logStore.getPublicLogs({ fromBlock: targetBlock.number, toBlock: targetBlock.number + 1 }))
        .logs;

      expect(logs.length).toBeGreaterThan(0);
      const expectedTxHashes = targetBlock.body.txEffects.map(txEffect => txEffect.txHash);
      for (const log of logs) {
        const expectedTxHash = expectedTxHashes[log.id.txIndex];
        expect(log.id.txHash.equals(expectedTxHash)).toBe(true);
      }
    });

    it('"fromBlock" and "toBlock" filter params are respected', async () => {
      // Set "fromBlock" and "toBlock"
      const fromBlock = 3;
      const toBlock = 7;

      const response = await logStore.getPublicLogs({ fromBlock, toBlock });
      const logs = response.logs;

      expect(response.maxLogsHit).toBeFalsy();

      // Compute expected logs from the blocks in range
      let expectedNumLogs = 0;
      for (let i = fromBlock - 1; i < toBlock - 1; i++) {
        const block = publishedCheckpoints[i].checkpoint.blocks[0];
        expectedNumLogs += block.body.txEffects.reduce((sum, tx) => sum + tx.publicLogs.length, 0);
      }
      expect(logs.length).toEqual(expectedNumLogs);

      for (const log of logs) {
        const blockNumber = log.id.blockNumber;
        expect(blockNumber).toBeGreaterThanOrEqual(fromBlock);
        expect(blockNumber).toBeLessThan(toBlock);
      }
    });

    it('"contractAddress" filter param is respected', async () => {
      // Get a random contract address from the logs
      const targetBlockIndex = randomInt(numBlocksForPublicLogs);
      const targetBlock = publishedCheckpoints[targetBlockIndex].checkpoint.blocks[0];
      const targetTxIndex = randomInt(getTxsPerBlock(targetBlock));
      const targetLogIndex = randomInt(getPublicLogsPerTx(targetBlock, targetTxIndex));
      const targetContractAddress =
        targetBlock.body.txEffects[targetTxIndex].publicLogs[targetLogIndex].contractAddress;

      const response = await logStore.getPublicLogs({ contractAddress: targetContractAddress });

      expect(response.maxLogsHit).toBeFalsy();

      for (const extendedLog of response.logs) {
        expect(extendedLog.log.contractAddress.equals(targetContractAddress)).toBeTruthy();
      }
    });

    it('"tag" filter param is respected', async () => {
      // Get a random tag from the logs
      const targetBlockIndex = randomInt(numBlocksForPublicLogs);
      const targetBlock = publishedCheckpoints[targetBlockIndex].checkpoint.blocks[0];
      const targetTxIndex = randomInt(getTxsPerBlock(targetBlock));
      const targetLogIndex = randomInt(getPublicLogsPerTx(targetBlock, targetTxIndex));
      const targetTag = targetBlock.body.txEffects[targetTxIndex].publicLogs[targetLogIndex].fields[0];

      const response = await logStore.getPublicLogs({ tag: targetTag });

      expect(response.maxLogsHit).toBeFalsy();
      expect(response.logs.length).toBeGreaterThan(0);

      for (const extendedLog of response.logs) {
        expect(extendedLog.log.fields[0].equals(targetTag)).toBeTruthy();
      }
    });

    it('"afterLog" filter param is respected', async () => {
      // Get a random log as reference
      const targetBlockIndex = randomInt(numBlocksForPublicLogs);
      const targetBlock = publishedCheckpoints[targetBlockIndex].checkpoint.blocks[0];
      const targetTxIndex = randomInt(getTxsPerBlock(targetBlock));
      const numLogsInTx = targetBlock.body.txEffects[targetTxIndex].publicLogs.length;
      const targetLogIndex = numLogsInTx > 0 ? randomInt(numLogsInTx) : 0;
      const targetBlockHash = await targetBlock.header.hash();

      const targetTxHash = targetBlock.body.txEffects[targetTxIndex].txHash;
      const afterLog = new LogId(
        BlockNumber(targetBlockIndex + INITIAL_L2_BLOCK_NUM),
        targetBlockHash,
        targetTxHash,
        targetTxIndex,
        targetLogIndex,
      );

      const response = await logStore.getPublicLogs({ afterLog });
      const logs = response.logs;

      expect(response.maxLogsHit).toBeFalsy();

      for (const log of logs) {
        const logId = log.id;
        expect(logId.blockNumber).toBeGreaterThanOrEqual(afterLog.blockNumber);
        if (logId.blockNumber === afterLog.blockNumber) {
          expect(logId.txIndex).toBeGreaterThanOrEqual(afterLog.txIndex);
          if (logId.txIndex === afterLog.txIndex) {
            expect(logId.logIndex).toBeGreaterThan(afterLog.logIndex);
          }
        }
      }
    });

    it('"txHash" filter param is respected when "afterLog" is set', async () => {
      // A random txHash should match nothing, even with afterLog set
      const txHash = TxHash.random();
      const afterLog = new LogId(BlockNumber(1), BlockHash.random(), TxHash.random(), 0, 0);

      const response = await logStore.getPublicLogs({ txHash, afterLog });
      expect(response.logs.length).toBe(0);
    });

    it('intersecting works', async () => {
      let logs = (await logStore.getPublicLogs({ fromBlock: -10 as BlockNumber, toBlock: -5 as BlockNumber })).logs;
      expect(logs.length).toBe(0);

      // "fromBlock" gets correctly trimmed to range and "toBlock" is exclusive
      logs = (await logStore.getPublicLogs({ fromBlock: -10 as BlockNumber, toBlock: BlockNumber(5) })).logs;
      let blockNumbers = new Set(logs.map(log => log.id.blockNumber));
      expect(blockNumbers).toEqual(new Set([1, 2, 3, 4]));

      // "toBlock" should be exclusive
      logs = (await logStore.getPublicLogs({ fromBlock: BlockNumber(1), toBlock: BlockNumber(1) })).logs;
      expect(logs.length).toBe(0);

      logs = (await logStore.getPublicLogs({ fromBlock: BlockNumber(10), toBlock: BlockNumber(5) })).logs;
      expect(logs.length).toBe(0);

      // both "fromBlock" and "toBlock" get correctly capped to range and logs from all blocks are returned
      logs = (await logStore.getPublicLogs({ fromBlock: -100 as BlockNumber, toBlock: +100 })).logs;
      blockNumbers = new Set(logs.map(log => log.id.blockNumber));
      expect(blockNumbers.size).toBe(numBlocksForPublicLogs);

      // intersecting with "afterLog" works
      logs = (
        await logStore.getPublicLogs({
          fromBlock: BlockNumber(2),
          toBlock: BlockNumber(5),
          afterLog: new LogId(BlockNumber(4), BlockHash.random(), TxHash.random(), 0, 0),
        })
      ).logs;
      blockNumbers = new Set(logs.map(log => log.id.blockNumber));
      expect(blockNumbers).toEqual(new Set([4]));

      logs = (
        await logStore.getPublicLogs({
          toBlock: BlockNumber(5),
          afterLog: new LogId(BlockNumber(5), BlockHash.random(), TxHash.random(), 1, 0),
        })
      ).logs;
      expect(logs.length).toBe(0);

      logs = (
        await logStore.getPublicLogs({
          fromBlock: BlockNumber(2),
          toBlock: BlockNumber(5),
          afterLog: new LogId(BlockNumber(100), BlockHash.random(), TxHash.random(), 0, 0),
        })
      ).logs;
      expect(logs.length).toBe(0);
    });

    it('"txIndex" and "logIndex" are respected when "afterLog.blockNumber" is equal to "fromBlock"', async () => {
      // Get a random log as reference
      const targetBlockIndex = randomInt(numBlocksForPublicLogs);
      const targetBlock = publishedCheckpoints[targetBlockIndex].checkpoint.blocks[0];
      const targetTxIndex = randomInt(getTxsPerBlock(targetBlock));
      const numLogsInTx = targetBlock.body.txEffects[targetTxIndex].publicLogs.length;
      const targetLogIndex = numLogsInTx > 0 ? randomInt(numLogsInTx) : 0;
      const targetBlockHash = await targetBlock.header.hash();
      const targetTxHash = targetBlock.body.txEffects[targetTxIndex].txHash;

      const afterLog = new LogId(
        BlockNumber(targetBlockIndex + INITIAL_L2_BLOCK_NUM),
        targetBlockHash,
        targetTxHash,
        targetTxIndex,
        targetLogIndex,
      );

      const response = await logStore.getPublicLogs({ afterLog, fromBlock: afterLog.blockNumber });
      const logs = response.logs;

      expect(response.maxLogsHit).toBeFalsy();

      for (const log of logs) {
        const logId = log.id;
        expect(logId.blockNumber).toBeGreaterThanOrEqual(afterLog.blockNumber);
        if (logId.blockNumber === afterLog.blockNumber) {
          expect(logId.txIndex).toBeGreaterThanOrEqual(afterLog.txIndex);
          if (logId.txIndex === afterLog.txIndex) {
            expect(logId.logIndex).toBeGreaterThan(afterLog.logIndex);
          }
        }
      }
    });
  });

  describe('getContractClassLogs', () => {
    let targetBlock: L2Block;
    let expectedContractClassLog: ContractClassLog;

    beforeEach(async () => {
      await blockStore.addCheckpoints(publishedCheckpoints);

      targetBlock = publishedCheckpoints[0].checkpoint.blocks[0];
      expectedContractClassLog = await ContractClassLog.random();
      targetBlock.body.txEffects.forEach((txEffect, index) => {
        txEffect.contractClassLogs = index === 0 ? [expectedContractClassLog] : [];
      });

      await logStore.addLogs([targetBlock]);
    });

    it('returns block hash on contract class log ids', async () => {
      const result = await logStore.getContractClassLogs({
        fromBlock: targetBlock.number,
        toBlock: targetBlock.number + 1,
      });

      expect(result.maxLogsHit).toBeFalsy();
      expect(result.logs).toHaveLength(1);

      const [{ id, log }] = result.logs;
      const expectedBlockHash = await targetBlock.header.hash();

      expect(id.blockHash.equals(expectedBlockHash)).toBe(true);
      expect(id.blockNumber).toEqual(targetBlock.number);
      expect(log).toEqual(expectedContractClassLog);
    });
  });

  describe('idempotency', () => {
    it('does not duplicate logs when addLogs is called twice with same block', async () => {
      const block = await L2Block.random(BlockNumber(1), {
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
      });

      // Add logs first time
      await logStore.addLogs([block]);

      // Get initial log count
      const initialLogs = await logStore.getPublicLogs({ fromBlock: BlockNumber(1), toBlock: BlockNumber(2) });
      const initialCount = initialLogs.logs.length;
      expect(initialCount).toBeGreaterThan(0);

      // Add logs second time (same block)
      await logStore.addLogs([block]);

      // Verify logs are NOT duplicated
      const finalLogs = await logStore.getPublicLogs({ fromBlock: BlockNumber(1), toBlock: BlockNumber(2) });
      expect(finalLogs.logs.length).toBe(initialCount);
    });
  });
});
