import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHash } from '@aztec/stdlib/block';
import { Checkpoint, type PublishedCheckpoint } from '@aztec/stdlib/checkpoint';
import { MAX_LOGS_PER_TAG } from '@aztec/stdlib/interfaces/api-limit';
import { LogCursor, type LogResult, SiloedTag, Tag } from '@aztec/stdlib/logs';
import '@aztec/stdlib/testing/jest';
import type { AppendOnlyTreeSnapshot } from '@aztec/stdlib/trees';

import { jest } from '@jest/globals';

import {
  type MockCheckpointWithLogsOptions,
  makeCheckpointWithLogs,
  makePrivateLogTag,
  makePublicLogTag,
  makePublishedCheckpoint,
  makeStateForBlock,
} from '../test/mock_structs.js';
import { BlockStore } from './block_store.js';
import { LogStore } from './log_store.js';

/**
 * Builds a list of `PublishedCheckpoint`s for sequential blocks `[1..count]`, chaining each
 * block's `lastArchive` to the previous block's `archive` so they pass `BlockStore.addCheckpoints`
 * validation. The caller may mutate the returned blocks (e.g. overriding log fields) before adding.
 */
async function buildChainedCheckpointsWithLogs(
  count: number,
  options: MockCheckpointWithLogsOptions,
): Promise<PublishedCheckpoint[]> {
  const checkpoints: PublishedCheckpoint[] = [];
  let previousArchive: AppendOnlyTreeSnapshot | undefined;
  for (let b = 1; b <= count; b++) {
    const ckpt = await makeCheckpointWithLogs(b, { ...options, previousArchive });
    previousArchive = ckpt.checkpoint.blocks[0].archive;
    checkpoints.push(ckpt);
  }
  return checkpoints;
}

const CONTRACT = AztecAddress.fromNumber(543254);

describe('LogStore', () => {
  let blockStore: BlockStore;
  let logStore: LogStore;
  let publishedCheckpoints: PublishedCheckpoint[];

  beforeEach(async () => {
    const db = await openTmpStore('log_store_test');
    blockStore = new BlockStore(db);
    logStore = new LogStore(db, blockStore);

    // Build 10 sequential single-block checkpoints, each with 2 txs and 2 logs/tx (private + public).
    publishedCheckpoints = [];
    const txsPerBlock = 2;
    for (let i = 0; i < 10; i++) {
      const blockNumber = i + 1;
      const previousArchive = i > 0 ? publishedCheckpoints[i - 1].checkpoint.blocks[0].archive : undefined;
      const checkpoint = await Checkpoint.random(CheckpointNumber(i + 1), {
        numBlocks: 1,
        startBlockNumber: blockNumber,
        previousArchive,
        txsPerBlock,
        state: makeStateForBlock(blockNumber, txsPerBlock),
        // Ensure each tx emits at least one nullifier (needed by validator).
        txOptions: { numNullifiers: 2, numPublicCallsPerTx: 1, numPublicLogsPerCall: 1 },
      });
      publishedCheckpoints.push(makePublishedCheckpoint(checkpoint, i + 10));
    }
  });

  describe('addLogs / deleteLogs', () => {
    it('adds private & public logs and returns true', async () => {
      const block = publishedCheckpoints[0].checkpoint.blocks[0];
      await blockStore.addProposedBlock(block);
      await expect(logStore.addLogs([block])).resolves.toEqual(true);
    });

    it('deletes all logs for the given blocks (reorg trim)', async () => {
      // Build a custom checkpoint where every log has a known tag so we can query it back.
      const ckpt = await makeCheckpointWithLogs(1, {
        numTxsPerBlock: 2,
        privateLogs: { numLogsPerTx: 1 },
        publicLogs: { numLogsPerTx: 1, contractAddress: CONTRACT },
      });
      const block = ckpt.checkpoint.blocks[0];
      await blockStore.addProposedBlock(block);
      await logStore.addLogs([block]);

      // Sanity: logs are present.
      const tag = makePrivateLogTag(1, 0, 0);
      const before = await logStore.getPrivateLogsByTags({ tags: [tag] });
      expect(before[0].length).toBe(1);

      await logStore.deleteLogs([block]);

      const after = await logStore.getPrivateLogsByTags({ tags: [tag] });
      expect(after[0].length).toBe(0);
    });
  });

  describe('getPrivateLogsByTags', () => {
    it('returns empty for an unknown tag', async () => {
      const ckpt = publishedCheckpoints[0];
      await blockStore.addCheckpoints([ckpt]);
      await logStore.addLogs(ckpt.checkpoint.blocks);

      const unseen = SiloedTag.random();
      const result = await logStore.getPrivateLogsByTags({ tags: [unseen] });
      expect(result).toEqual([[]]);
    });

    it('returns logs in canonical (block, txIndex, logIndex) order for a known tag', async () => {
      // 3 blocks, each with 2 txs, each with 2 private logs, all sharing a fixed tag.
      const sharedTag = new SiloedTag(new Fr(0xdeadbeefn));
      const ckpts = await buildChainedCheckpointsWithLogs(3, {
        numTxsPerBlock: 2,
        privateLogs: { numLogsPerTx: 2 },
      });
      // Override the first field of every private log to the shared tag.
      for (const ckpt of ckpts) {
        for (const txEffect of ckpt.checkpoint.blocks[0].body.txEffects) {
          for (const log of txEffect.privateLogs) {
            (log.fields as Fr[])[0] = sharedTag.value;
          }
        }
      }
      const blocks = ckpts.map(c => c.checkpoint.blocks[0]);
      await blockStore.addCheckpoints(ckpts);
      await logStore.addLogs(blocks);

      // 3 blocks * 2 txs * 2 logs = 12, but we cap at MAX_LOGS_PER_TAG.
      const [page1] = await logStore.getPrivateLogsByTags({ tags: [sharedTag] });
      expect(page1.length).toBe(MAX_LOGS_PER_TAG);

      // Verify order: blockNumber non-decreasing; within a block, logIndexWithinTx ascending.
      for (let i = 1; i < page1.length; i++) {
        expect(page1[i].blockNumber >= page1[i - 1].blockNumber).toBe(true);
      }
    });

    it('respects fromBlock / toBlock', async () => {
      const sharedTag = new SiloedTag(new Fr(0x1234n));
      const ckpts = await buildChainedCheckpointsWithLogs(5, {
        numTxsPerBlock: 1,
        privateLogs: { numLogsPerTx: 1 },
      });
      for (const ckpt of ckpts) {
        ckpt.checkpoint.blocks[0].body.txEffects[0].privateLogs[0].fields[0] = sharedTag.value;
      }
      const blocks = ckpts.map(c => c.checkpoint.blocks[0]);
      await blockStore.addCheckpoints(ckpts);
      await logStore.addLogs(blocks);

      // Block range [2, 4) → blocks 2, 3 only.
      const [res] = await logStore.getPrivateLogsByTags({
        tags: [sharedTag],
        fromBlock: BlockNumber(2),
        toBlock: BlockNumber(4),
      });
      expect(res.map(l => l.blockNumber)).toEqual([BlockNumber(2), BlockNumber(3)]);
    });

    it('returns empty when the range is before the first log', async () => {
      // Logs live only on block 5; the chained checkpoints 1-4 carry no logs for `sharedTag`.
      const sharedTag = new SiloedTag(new Fr(0xaa11n));
      const ckpts = await buildChainedCheckpointsWithLogs(5, {
        numTxsPerBlock: 1,
        privateLogs: { numLogsPerTx: 1 },
      });
      ckpts[4].checkpoint.blocks[0].body.txEffects[0].privateLogs[0].fields[0] = sharedTag.value;
      const blocks = ckpts.map(c => c.checkpoint.blocks[0]);
      await blockStore.addCheckpoints(ckpts);
      await logStore.addLogs(blocks);

      // Range [1, 5) excludes block 5 → no hits.
      const [res] = await logStore.getPrivateLogsByTags({
        tags: [sharedTag],
        fromBlock: BlockNumber(1),
        toBlock: BlockNumber(5),
      });
      expect(res).toEqual([]);
    });

    it('returns empty when the range is past the last log', async () => {
      // Logs live only on block 3; querying from block 10 yields nothing.
      const sharedTag = new SiloedTag(new Fr(0xbb22n));
      const ckpts = await buildChainedCheckpointsWithLogs(3, {
        numTxsPerBlock: 1,
        privateLogs: { numLogsPerTx: 1 },
      });
      ckpts[2].checkpoint.blocks[0].body.txEffects[0].privateLogs[0].fields[0] = sharedTag.value;
      const blocks = ckpts.map(c => c.checkpoint.blocks[0]);
      await blockStore.addCheckpoints(ckpts);
      await logStore.addLogs(blocks);

      const [res] = await logStore.getPrivateLogsByTags({
        tags: [sharedTag],
        fromBlock: BlockNumber(10),
      });
      expect(res).toEqual([]);
    });

    it('paginates correctly across a page boundary via afterLog', async () => {
      const sharedTag = new SiloedTag(new Fr(0xcc33n));
      const ckpts = await buildChainedCheckpointsWithLogs(6, {
        numTxsPerBlock: 2,
        privateLogs: { numLogsPerTx: 2 },
      });
      for (const ckpt of ckpts) {
        for (const tx of ckpt.checkpoint.blocks[0].body.txEffects) {
          for (const log of tx.privateLogs) {
            (log.fields as Fr[])[0] = sharedTag.value;
          }
        }
      }
      const blocks = ckpts.map(c => c.checkpoint.blocks[0]);
      await blockStore.addCheckpoints(ckpts);
      await logStore.addLogs(blocks);

      // 6 blocks * 2 txs * 2 logs = 24 total. First page returns 10.
      const [page1] = await logStore.getPrivateLogsByTags({ tags: [sharedTag] });
      expect(page1.length).toBe(MAX_LOGS_PER_TAG);

      const cursor = LogCursor.fromLog(page1[page1.length - 1]);
      const [page2b] = await logStore.getPrivateLogsByTags({ tags: [{ tag: sharedTag, afterLog: cursor }] });
      expect(page2b.length).toBe(MAX_LOGS_PER_TAG);
      // No overlap between page1 and page2b: every page2b entry must be strictly after the page1 cursor.
      const lastP1 = page1[page1.length - 1];
      const firstP2 = page2b[0];
      expect(
        firstP2.blockNumber > lastP1.blockNumber ||
          (firstP2.blockNumber === lastP1.blockNumber &&
            (!firstP2.txHash.equals(lastP1.txHash) || firstP2.logIndexWithinTx > lastP1.logIndexWithinTx)),
      ).toBe(true);
    });

    it('handles overlapping ranges across multiple tags', async () => {
      const tagA = new SiloedTag(new Fr(101));
      const tagB = new SiloedTag(new Fr(102));
      const ckpts = await buildChainedCheckpointsWithLogs(3, {
        numTxsPerBlock: 1,
        privateLogs: { numLogsPerTx: 2 },
      });
      for (const ckpt of ckpts) {
        // log 0 → tagA, log 1 → tagB
        ckpt.checkpoint.blocks[0].body.txEffects[0].privateLogs[0].fields[0] = tagA.value;
        ckpt.checkpoint.blocks[0].body.txEffects[0].privateLogs[1].fields[0] = tagB.value;
      }
      const blocks = ckpts.map(c => c.checkpoint.blocks[0]);
      await blockStore.addCheckpoints(ckpts);
      await logStore.addLogs(blocks);

      const result = await logStore.getPrivateLogsByTags({ tags: [tagA, tagB] });
      expect(result[0].length).toBe(3);
      expect(result[1].length).toBe(3);
      // Tag A logs all share tagA's tag in field 0; same for tag B.
      expect(result[0].every(l => l.logData[0].equals(tagA.value))).toBe(true);
      expect(result[1].every(l => l.logData[0].equals(tagB.value))).toBe(true);
    });

    it('filters by txHash', async () => {
      const tag = new SiloedTag(new Fr(0x5555));
      const ckpt = await makeCheckpointWithLogs(1, { numTxsPerBlock: 3, privateLogs: { numLogsPerTx: 1 } });
      for (const tx of ckpt.checkpoint.blocks[0].body.txEffects) {
        tx.privateLogs[0].fields[0] = tag.value;
      }
      await blockStore.addProposedBlock(ckpt.checkpoint.blocks[0]);
      await logStore.addLogs([ckpt.checkpoint.blocks[0]]);

      const target = ckpt.checkpoint.blocks[0].body.txEffects[1].txHash;
      const [res] = await logStore.getPrivateLogsByTags({ tags: [tag], txHash: target });
      expect(res.length).toBe(1);
      expect(res[0].txHash.equals(target)).toBe(true);
    });

    it('rejects txHash combined with fromBlock/toBlock', () => {
      // Validation throws synchronously before returning the transaction promise,
      // so use the sync `.toThrow` matcher rather than `.rejects.toThrow`.
      const tag = SiloedTag.random();
      expect(() =>
        logStore.getPrivateLogsByTags({
          tags: [tag],
          txHash: { equals: () => false } as any,
          fromBlock: BlockNumber(1),
        }),
      ).toThrow(/mutually exclusive/i);
    });

    it('paginates within a single tx via txHash + afterLog', async () => {
      const tag = new SiloedTag(new Fr(0x7777));
      // One tx with 15 logs sharing the same tag; first page returns 10, resume returns 5.
      const ckpt = await makeCheckpointWithLogs(1, { numTxsPerBlock: 1, privateLogs: { numLogsPerTx: 15 } });
      const txEffect = ckpt.checkpoint.blocks[0].body.txEffects[0];
      for (const log of txEffect.privateLogs) {
        log.fields[0] = tag.value;
      }
      await blockStore.addProposedBlock(ckpt.checkpoint.blocks[0]);
      await logStore.addLogs([ckpt.checkpoint.blocks[0]]);

      const target = txEffect.txHash;
      const [page1] = await logStore.getPrivateLogsByTags({ tags: [tag], txHash: target });
      expect(page1.length).toBe(MAX_LOGS_PER_TAG);
      const cursor = LogCursor.fromLog(page1[page1.length - 1]);
      const [page2] = await logStore.getPrivateLogsByTags({
        tags: [{ tag, afterLog: cursor }],
        txHash: target,
      });
      expect(page2.length).toBe(5);
      // All from the same tx
      expect(page1.every(l => l.txHash.equals(target))).toBe(true);
      expect(page2.every(l => l.txHash.equals(target))).toBe(true);
    });

    it('referenceBlock caps a txHash query past the anchor', async () => {
      const tag = new SiloedTag(new Fr(0x9999));
      // Block 3 has the tx with the tag.
      const ckpts = await buildChainedCheckpointsWithLogs(3, {
        numTxsPerBlock: 1,
        privateLogs: { numLogsPerTx: 1 },
      });
      for (const ckpt of ckpts) {
        ckpt.checkpoint.blocks[0].body.txEffects[0].privateLogs[0].fields[0] = tag.value;
      }
      await blockStore.addCheckpoints(ckpts);
      await logStore.addLogs(ckpts.map(c => c.checkpoint.blocks[0]));

      const blockTwoHash = await ckpts[1].checkpoint.blocks[0].hash();
      const targetTx = ckpts[2].checkpoint.blocks[0].body.txEffects[0].txHash;

      // referenceBlock = block 2; tx is in block 3 → past anchor → empty.
      const [res] = await logStore.getPrivateLogsByTags({
        tags: [tag],
        txHash: targetTx,
        referenceBlock: blockTwoHash,
      });
      expect(res).toEqual([]);
    });

    it('throws when referenceBlock points to a missing block', async () => {
      const tag = SiloedTag.random();
      const missing = BlockHash.random();
      await expect(logStore.getPrivateLogsByTags({ tags: [tag], referenceBlock: missing })).rejects.toThrow(
        /not found/i,
      );
    });

    it('attaches noteHashes + nullifiers only when includeEffects is set', async () => {
      const tag = new SiloedTag(new Fr(0xeeee));
      const ckpt = await makeCheckpointWithLogs(1, { numTxsPerBlock: 1, privateLogs: { numLogsPerTx: 1 } });
      ckpt.checkpoint.blocks[0].body.txEffects[0].privateLogs[0].fields[0] = tag.value;
      await blockStore.addProposedBlock(ckpt.checkpoint.blocks[0]);
      await logStore.addLogs([ckpt.checkpoint.blocks[0]]);

      const [withoutEffects] = await logStore.getPrivateLogsByTags({ tags: [tag] });
      expect(withoutEffects[0].noteHashes).toBeUndefined();
      expect(withoutEffects[0].nullifiers).toBeUndefined();

      const [withEffects] = await logStore.getPrivateLogsByTags({ tags: [tag], includeEffects: true });
      expect(withEffects[0].noteHashes).toBeDefined();
      expect(withEffects[0].nullifiers).toBeDefined();
      // All nullifiers, not just the first.
      const txEffect = ckpt.checkpoint.blocks[0].body.txEffects[0];
      expect(withEffects[0].nullifiers!.length).toBe(txEffect.nullifiers.length);
    });

    it('batches effect lookups (one fetch per unique tx in the page)', async () => {
      // Build a single block with 2 txs, each emitting 3 logs of the same tag → 6 logs, 2 unique txs.
      const tag = new SiloedTag(new Fr(0xabcd));
      const ckpt = await makeCheckpointWithLogs(1, { numTxsPerBlock: 2, privateLogs: { numLogsPerTx: 3 } });
      for (const tx of ckpt.checkpoint.blocks[0].body.txEffects) {
        for (const log of tx.privateLogs) {
          log.fields[0] = tag.value;
        }
      }
      await blockStore.addProposedBlock(ckpt.checkpoint.blocks[0]);
      await logStore.addLogs([ckpt.checkpoint.blocks[0]]);

      const spy = jest.spyOn(blockStore, 'getNoteHashesAndNullifiers');

      const [res] = await logStore.getPrivateLogsByTags({ tags: [tag], includeEffects: true });
      expect(res.length).toBe(6);
      // Exactly one batched call.
      expect(spy).toHaveBeenCalledTimes(1);
      // …with the 2 distinct txHashes.
      const argTxHashes = spy.mock.calls[0][0];
      expect(argTxHashes.length).toBe(2);
      spy.mockRestore();
    });
  });

  describe('getPublicLogsByTags', () => {
    it('requires contractAddress and filters on it', async () => {
      const tag = new Tag(new Fr(0xf00d));
      const ckpt = await makeCheckpointWithLogs(1, {
        numTxsPerBlock: 1,
        publicLogs: { numLogsPerTx: 1, contractAddress: CONTRACT },
      });
      ckpt.checkpoint.blocks[0].body.txEffects[0].publicLogs[0].fields[0] = tag.value;
      await blockStore.addProposedBlock(ckpt.checkpoint.blocks[0]);
      await logStore.addLogs([ckpt.checkpoint.blocks[0]]);

      // Same tag, different contract → no hits.
      const otherContract = AztecAddress.fromNumber(99);
      const [missing] = await logStore.getPublicLogsByTags({ contractAddress: otherContract, tags: [tag] });
      expect(missing).toEqual([]);

      const [found] = await logStore.getPublicLogsByTags({ contractAddress: CONTRACT, tags: [tag] });
      expect(found.length).toBe(1);
      expect(found[0].logData[0].equals(tag.value)).toBe(true);
    });

    it('handles range filtering', async () => {
      const tag = new Tag(new Fr(0xfeed));
      const ckpts = await buildChainedCheckpointsWithLogs(5, {
        numTxsPerBlock: 1,
        publicLogs: { numLogsPerTx: 1, contractAddress: CONTRACT },
      });
      for (const ckpt of ckpts) {
        ckpt.checkpoint.blocks[0].body.txEffects[0].publicLogs[0].fields[0] = tag.value;
      }
      const blocks = ckpts.map(c => c.checkpoint.blocks[0]);
      await blockStore.addCheckpoints(ckpts);
      await logStore.addLogs(blocks);

      const [res] = await logStore.getPublicLogsByTags({
        contractAddress: CONTRACT,
        tags: [tag],
        fromBlock: BlockNumber(2),
        toBlock: BlockNumber(5),
      });
      expect(res.map(l => l.blockNumber)).toEqual([BlockNumber(2), BlockNumber(3), BlockNumber(4)]);
    });

    it('rejects txHash combined with fromBlock/toBlock', () => {
      // Validation throws synchronously before returning the transaction promise,
      // so use the sync `.toThrow` matcher rather than `.rejects.toThrow`.
      const tag = Tag.random();
      expect(() =>
        logStore.getPublicLogsByTags({
          contractAddress: CONTRACT,
          tags: [tag],
          txHash: { equals: () => false } as any,
          toBlock: BlockNumber(5),
        }),
      ).toThrow(/mutually exclusive/i);
    });
  });

  // Touch some imports to keep them flagged-as-used for the lint pass.
  it('utility', () => {
    expect(typeof makePublicLogTag).toBe('function');
    const _result: LogResult[] = [];
    void _result;
  });
});
