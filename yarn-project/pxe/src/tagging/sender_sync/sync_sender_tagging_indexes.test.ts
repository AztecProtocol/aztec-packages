import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { RevertCode } from '@aztec/stdlib/avm';
import { BlockHash } from '@aztec/stdlib/block';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { AppTaggingSecretKind, type LogResult, PrivateLog } from '@aztec/stdlib/logs';
import { randomAppTaggingSecret, randomPrivateLogResult } from '@aztec/stdlib/testing';
import { type MinedTxStatus, TxEffect, TxExecutionResult, TxHash, TxStatus } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import { SenderTaggingStore } from '../../storage/tagging_store/sender_tagging_store.js';
import { type AppTaggingSecret, UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN } from '../index.js';
import { computeSiloedTagForIndex, extractTags } from '../testing/tag_query_test_utils.js';
import { syncSenderTaggingIndexes } from './sync_sender_tagging_indexes.js';
import { minedReceipt } from './utils/test_utils.js';

const MOCK_ANCHOR_BLOCK_HASH = BlockHash.random();
// The finalized tip the tests sync against, and log block numbers on either side of it.
const MOCK_FINALIZED_BLOCK_NUMBER = BlockNumber(15);
const FINALIZED_LOG_BLOCK = MOCK_FINALIZED_BLOCK_NUMBER - 1;
const UNFINALIZED_LOG_BLOCK = MOCK_FINALIZED_BLOCK_NUMBER + 1;

describe('syncSenderTaggingIndexes', () => {
  // The secret to be used on the input of the syncSenderTaggingIndexes function.
  let secret: AppTaggingSecret;

  let aztecNode: MockProxy<AztecNode>;
  let taggingStore: SenderTaggingStore;

  async function setUp() {
    secret = await randomAppTaggingSecret(AppTaggingSecretKind.UNCONSTRAINED);

    aztecNode = mock<AztecNode>();
    taggingStore = new SenderTaggingStore(await openTmpStore('test'));
  }

  it('no new logs found for a given secret', async () => {
    await setUp();

    await mockNodeLogs([]);

    await sync();

    // Highest used and finalized indexes should stay undefined
    expect(await taggingStore.getLastUsedIndex(secret, 'test')).toBeUndefined();
    expect(await taggingStore.getLastFinalizedIndex(secret, 'test')).toBeUndefined();
  });

  it('updates the highest finalized index for a constrained secret', async () => {
    await setUp();
    // Override unconstrained secret from `setUp`
    secret = await randomAppTaggingSecret(AppTaggingSecretKind.CONSTRAINED);

    const finalizedIndex = 3;

    await mockNodeLogs([{ index: finalizedIndex, txHash: TxHash.random(), blockNumber: FINALIZED_LOG_BLOCK }]);

    await sync();

    expect(await taggingStore.getLastFinalizedIndex(secret, 'test')).toBe(finalizedIndex);
    expect(await taggingStore.getLastUsedIndex(secret, 'test')).toBe(finalizedIndex);
  });

  // These tests need to be run together in sequence.
  describe('sequential tests', () => {
    const finalizedIndexStep1 = 3;

    const pendingTxHashStep2 = TxHash.random();
    const pendingIndexStep2 = 5;

    beforeAll(async () => {
      await setUp();
    });

    it('step 1: highest finalized index is updated', async () => {
      await mockNodeLogs([{ index: finalizedIndexStep1, txHash: TxHash.random(), blockNumber: FINALIZED_LOG_BLOCK }]);

      await sync();

      // Verify the highest finalized index is updated to 3
      expect(await taggingStore.getLastFinalizedIndex(secret, 'test')).toBe(finalizedIndexStep1);
      // Verify the highest used index also returns 3 (when there is no higher pending index the highest used index is
      // the highest finalized index).
      expect(await taggingStore.getLastUsedIndex(secret, 'test')).toBe(finalizedIndexStep1);
    });

    it('step 2: pending log is synced', async () => {
      await mockNodeLogs([
        { index: pendingIndexStep2, txHash: pendingTxHashStep2, blockNumber: UNFINALIZED_LOG_BLOCK },
      ]);

      await sync();

      // Verify the highest finalized index was not updated
      expect(await taggingStore.getLastFinalizedIndex(secret, 'test')).toBe(finalizedIndexStep1);
      // Verify the highest used index was updated to the pending index
      expect(await taggingStore.getLastUsedIndex(secret, 'test')).toBe(pendingIndexStep2);
    });

    it('step 3: syncs logs across 2 windows', async () => {
      const newHighestFinalizedIndex = finalizedIndexStep1 + 4;
      const newHighestUsedIndex = newHighestFinalizedIndex + UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN;

      await mockNodeLogs([
        // The log left pending by step 2 is now in a finalized block.
        { index: pendingIndexStep2, txHash: pendingTxHashStep2, blockNumber: FINALIZED_LOG_BLOCK },
        { index: newHighestFinalizedIndex, txHash: TxHash.random(), blockNumber: FINALIZED_LOG_BLOCK },
        { index: newHighestUsedIndex, txHash: TxHash.random(), blockNumber: UNFINALIZED_LOG_BLOCK },
      ]);

      await sync();

      expect(await taggingStore.getLastFinalizedIndex(secret, 'test')).toBe(newHighestFinalizedIndex);
      expect(await taggingStore.getLastUsedIndex(secret, 'test')).toBe(newHighestUsedIndex);
    });
  });

  it('handles pending and finalized logs found at the same index', async () => {
    await setUp();

    const pendingAndFinalizedIndex = 3;

    // Two txs used the same tag, one still pending and one already finalized. The duplicate must not be ignored.
    await mockNodeLogs([
      { index: pendingAndFinalizedIndex, txHash: TxHash.random(), blockNumber: UNFINALIZED_LOG_BLOCK },
      { index: pendingAndFinalizedIndex, txHash: TxHash.random(), blockNumber: FINALIZED_LOG_BLOCK },
    ]);

    await sync();

    // Verify that both highest finalized and highest used were set to the pending and finalized index
    expect(await taggingStore.getLastFinalizedIndex(secret, 'test')).toBe(pendingAndFinalizedIndex);
    expect(await taggingStore.getLastUsedIndex(secret, 'test')).toBe(pendingAndFinalizedIndex);
  });

  it('finalizes pre-existing pending entries even when no new logs are found', async () => {
    await setUp();

    const pendingIndex = 4;
    const pendingTxHash = TxHash.random();

    // Seed the store with a pending entry, mirroring what a prior sync (or a tx sent from this PXE) would have written.
    await taggingStore.storePendingIndexes(
      [{ extendedSecret: secret, lowestIndex: pendingIndex, highestIndex: pendingIndex }],
      pendingTxHash,
      'test',
    );

    await mockNodeLogs([]);
    mockNodeReceipts([{ txHash: pendingTxHash, status: TxStatus.FINALIZED }]);

    await sync();

    expect(await taggingStore.getLastFinalizedIndex(secret, 'test')).toBe(pendingIndex);
    expect(await taggingStore.getLastUsedIndex(secret, 'test')).toBe(pendingIndex);
  });

  it('does not call getTxReceipt when no pending entries exist and no new logs are found', async () => {
    await setUp();

    await mockNodeLogs([]);

    await sync();

    // Single window iteration: empty result breaks the loop immediately.
    expect(aztecNode.getPrivateLogsByTags).toHaveBeenCalledTimes(1);
    expect(aztecNode.getTxReceipt).not.toHaveBeenCalled();
  });

  it('fetches receipts only for pending txs absent from the logs', async () => {
    await setUp();

    const preExistingIndex = 3;
    const newlyDiscoveredIndex = 7;
    const preExistingTxHash = TxHash.random();

    await taggingStore.storePendingIndexes(
      [{ extendedSecret: secret, lowestIndex: preExistingIndex, highestIndex: preExistingIndex }],
      preExistingTxHash,
      'test',
    );

    const newlyDiscoveredTxHash = TxHash.random();
    await mockNodeLogs([
      { index: newlyDiscoveredIndex, txHash: newlyDiscoveredTxHash, blockNumber: FINALIZED_LOG_BLOCK },
    ]);
    mockNodeReceipts([{ txHash: preExistingTxHash, status: TxStatus.FINALIZED }]);

    await sync();

    expect(await taggingStore.getLastFinalizedIndex(secret, 'test')).toBe(newlyDiscoveredIndex);
    expect(await taggingStore.getLastUsedIndex(secret, 'test')).toBe(newlyDiscoveredIndex);
    expect(aztecNode.getTxReceipt).toHaveBeenCalledTimes(1);
    expect(aztecNode.getTxReceipt).toHaveBeenCalledWith(preExistingTxHash);
    expect(aztecNode.getTxReceipt).not.toHaveBeenCalledWith(newlyDiscoveredTxHash);
  });

  it('keeps the indexes of a pending tx while its receipt is not finalized', async () => {
    await setUp();

    const pendingIndex = 4;
    const pendingTxHash = TxHash.random();

    await taggingStore.storePendingIndexes(
      [{ extendedSecret: secret, lowestIndex: pendingIndex, highestIndex: pendingIndex }],
      pendingTxHash,
      'test',
    );

    await mockNodeLogs([]);
    mockNodeReceipts([{ txHash: pendingTxHash, status: TxStatus.PROPOSED, blockNumber: UNFINALIZED_LOG_BLOCK }]);

    await sync();

    expect(await taggingStore.getLastFinalizedIndex(secret, 'test')).toBeUndefined();
    expect(await taggingStore.getLastUsedIndex(secret, 'test')).toBe(pendingIndex);
    // Nothing was finalized, so the loop must stop after the first window instead of re-querying the same one.
    expect(aztecNode.getPrivateLogsByTags).toHaveBeenCalledTimes(1);
  });

  it('resolves a rediscovered pending tx from the logs without any receipt call', async () => {
    await setUp();

    const pendingIndex = 5;
    const pendingTxHash = TxHash.random();

    await taggingStore.storePendingIndexes(
      [{ extendedSecret: secret, lowestIndex: pendingIndex, highestIndex: pendingIndex }],
      pendingTxHash,
      'test',
    );

    // The logs carry the same tx at the same tag, which `storePendingIndexes` treats as a no-op duplicate.
    await mockNodeLogs([{ index: pendingIndex, txHash: pendingTxHash, blockNumber: FINALIZED_LOG_BLOCK }]);

    await sync();

    expect(await taggingStore.getLastFinalizedIndex(secret, 'test')).toBe(pendingIndex);
    expect(aztecNode.getTxReceipt).not.toHaveBeenCalled();
  });

  it('handles a partially reverted tx whose pending range was recorded at prove time', async () => {
    await setUp();

    const revertedTxHash = TxHash.random();

    // Prove-time persist: logs at indexes 4 (setup phase) through 6 (app logic phase) under the same secret.
    await taggingStore.storePendingIndexes(
      [{ extendedSecret: secret, lowestIndex: 4, highestIndex: 6 }],
      revertedTxHash,
      'test',
    );

    // Only the setup-phase log survived the revert, so the node only knows the tag at index 4. Discovery therefore
    // re-derives a range narrower than the prove-time one, which the receipt step below has to resolve.
    await mockNodeLogs([{ index: 4, txHash: revertedTxHash, blockNumber: FINALIZED_LOG_BLOCK }]);

    const survivingTag = await computeSiloedTagForIndex(secret, 4);
    const txEffect = new TxEffect(
      RevertCode.REVERTED,
      revertedTxHash,
      Fr.ZERO,
      [Fr.random()], // noteHashes
      [Fr.random()], // nullifiers
      [], // l2ToL1Msgs
      [], // publicDataWrites
      [PrivateLog.random(survivingTag.value)], // only the tag at index 4 survived
      [], // publicLogs
      [], // contractClassLogs
    );

    mockNodeReceipts([
      {
        txHash: revertedTxHash,
        status: TxStatus.FINALIZED,
        executionResult: TxExecutionResult.REVERTED,
        txEffect,
      },
    ]);

    await sync();

    // The surviving index is finalized and the squashed indexes 5-6 are freed for reuse.
    expect(await taggingStore.getLastFinalizedIndex(secret, 'test')).toBe(4);
    expect(await taggingStore.getLastUsedIndex(secret, 'test')).toBe(4);
    // Reconciliation must remove the pending entry entirely — a stale entry would keep resurfacing in later syncs.
    const pendingAfterSync = await taggingStore.getPendingTxs(
      secret,
      0,
      UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN,
      'test',
    );
    expect(pendingAfterSync).toEqual([]);

    // A repeat sync must be a clean no-op: the behavior being pinned here is that the secret will not throw on every
    // subsequent sync.
    await sync();

    expect(await taggingStore.getLastFinalizedIndex(secret, 'test')).toBe(4);
    expect(await taggingStore.getLastUsedIndex(secret, 'test')).toBe(4);
  });

  it('frees the reserved indexes when a reverted tx left no log onchain', async () => {
    await setUp();

    const revertedTxHash = TxHash.random();

    await taggingStore.storePendingIndexes(
      [{ extendedSecret: secret, lowestIndex: 4, highestIndex: 6 }],
      revertedTxHash,
      'test',
    );

    // Nothing this secret emitted survived the revert, so it is missing from the logs and its effect carries no
    // private log at all.
    await mockNodeLogs([]);

    const txEffect = new TxEffect(
      RevertCode.REVERTED,
      revertedTxHash,
      Fr.ZERO,
      [], // noteHashes
      [Fr.random()], // nullifiers
      [], // l2ToL1Msgs
      [], // publicDataWrites
      [], // privateLogs
      [], // publicLogs
      [], // contractClassLogs
    );

    mockNodeReceipts([
      {
        txHash: revertedTxHash,
        status: TxStatus.FINALIZED,
        executionResult: TxExecutionResult.REVERTED,
        txEffect,
      },
    ]);

    await sync();

    // No tag reached the chain, so nothing is finalized and the reserved indexes are released for reuse.
    expect(await taggingStore.getLastFinalizedIndex(secret, 'test')).toBeUndefined();
    expect(await taggingStore.getLastUsedIndex(secret, 'test')).toBeUndefined();
    // The status has to come back before the effect can be asked for, so this path costs two receipt fetches.
    expect(aztecNode.getTxReceipt).toHaveBeenCalledTimes(2);
  });

  it('leaves another secret pending when finalizing this one from the logs', async () => {
    await setUp();

    const otherSecret = await randomAppTaggingSecret(AppTaggingSecretKind.UNCONSTRAINED);
    const revertedTxHash = TxHash.random();

    // Prove-time persist: a log for the synced secret in the setup phase and one for another secret in app logic.
    await taggingStore.storePendingIndexes(
      [
        { extendedSecret: secret, lowestIndex: 1, highestIndex: 1 },
        { extendedSecret: otherSecret, lowestIndex: 3, highestIndex: 3 },
      ],
      revertedTxHash,
      'test',
    );

    // The public part reverted, so only the setup-phase log is onchain. The logs say nothing about the other secret,
    // whose own sync has to resolve it against the tx effect.
    await mockNodeLogs([{ index: 1, txHash: revertedTxHash, blockNumber: FINALIZED_LOG_BLOCK }]);

    await sync();

    expect(await taggingStore.getLastFinalizedIndex(secret, 'test')).toBe(1);
    // Index 3 never reached the chain, so it must stay pending rather than be recorded as finalized.
    expect(await taggingStore.getLastFinalizedIndex(otherSecret, 'test')).toBeUndefined();
    expect(await taggingStore.getLastUsedIndex(otherSecret, 'test')).toBe(3);
  });

  it('finalizes another secret too when the receipt reports the whole tx succeeded', async () => {
    await setUp();

    const otherSecret = await randomAppTaggingSecret(AppTaggingSecretKind.UNCONSTRAINED);
    const txHash = TxHash.random();

    await taggingStore.storePendingIndexes(
      [
        { extendedSecret: secret, lowestIndex: 1, highestIndex: 1 },
        { extendedSecret: otherSecret, lowestIndex: 3, highestIndex: 3 },
      ],
      txHash,
      'test',
    );

    // Absent from the window's logs, so the receipt is the only evidence. It covers the whole tx, which succeeded,
    // so it evidences the other secret's log too.
    await mockNodeLogs([]);
    mockNodeReceipts([{ txHash, status: TxStatus.FINALIZED }]);

    await sync();

    expect(await taggingStore.getLastFinalizedIndex(secret, 'test')).toBe(1);
    expect(await taggingStore.getLastFinalizedIndex(otherSecret, 'test')).toBe(3);
  });

  it('widens a tracked pending range when discovery evidences further indexes for the same tx', async () => {
    await setUp();

    const foreignTxHash = TxHash.random();

    // Another PXE sharing this secret sent the tx, and an earlier window discovered only its first index.
    await taggingStore.storePendingIndexes(
      [{ extendedSecret: secret, lowestIndex: 10, highestIndex: 10 }],
      foreignTxHash,
      'test',
    );

    // The chain shows the tx actually used indexes 10 and 11, both past the finalized tip.
    await mockNodeLogs([
      { index: 10, txHash: foreignTxHash, blockNumber: UNFINALIZED_LOG_BLOCK },
      { index: 11, txHash: foreignTxHash, blockNumber: UNFINALIZED_LOG_BLOCK },
    ]);

    await sync();

    // The next index choice must account for the onchain tag at index 11.
    expect(await taggingStore.getLastUsedIndex(secret, 'test')).toBe(11);
    expect(await taggingStore.getLastFinalizedIndex(secret, 'test')).toBeUndefined();
  });

  it('assembles a pending range piecewise when a tx straddles the sync window boundary', async () => {
    await setUp();

    const straddlingTxHash = TxHash.random();
    const lowerStraddleIndex = UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN - 1;
    const upperStraddleIndex = UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN;

    await mockNodeLogs([
      // A tx finalized at index 0 advances the finalized index during window 1, so the loop proceeds to window 2.
      { index: 0, txHash: TxHash.random(), blockNumber: FINALIZED_LOG_BLOCK },
      // The straddling tx used the last index of window 1 and the first index of window 2, both past the tip, so its
      // entry stays pending until the second sync below.
      { index: lowerStraddleIndex, txHash: straddlingTxHash, blockNumber: UNFINALIZED_LOG_BLOCK },
      { index: upperStraddleIndex, txHash: straddlingTxHash, blockNumber: UNFINALIZED_LOG_BLOCK },
    ]);

    await sync();

    // The straddled range must have been assembled piecewise: window 1's logs query covers the lower straddle index
    // and window 2's the upper. (Each window fits in a single RPC page, so there is one logs call per window.)
    expect(aztecNode.getPrivateLogsByTags).toHaveBeenCalledTimes(2);
    const lowerStraddleTag = await computeSiloedTagForIndex(secret, lowerStraddleIndex);
    const upperStraddleTag = await computeSiloedTagForIndex(secret, upperStraddleIndex);
    const queriedTags = aztecNode.getPrivateLogsByTags.mock.calls.map(([query]) => extractTags(query));
    expect(queriedTags[0].some(tag => tag.equals(lowerStraddleTag))).toBe(true);
    expect(queriedTags[1].some(tag => tag.equals(upperStraddleTag))).toBe(true);

    expect(await taggingStore.getLastFinalizedIndex(secret, 'test')).toBe(0);
    // The next index choice must account for both straddled onchain tags.
    expect(await taggingStore.getLastUsedIndex(secret, 'test')).toBe(upperStraddleIndex);

    // The straddling tx later finalizes (the finalized tip advances past its block). A single widened entry
    // finalizes cleanly at the upper index — a duplicate entry for the same txHash would instead trip the
    // multiple-pending-entries guard during finalization.
    await sync({ finalizedAt: BlockNumber(20) });

    expect(await taggingStore.getLastFinalizedIndex(secret, 'test')).toBe(upperStraddleIndex);
    expect(await taggingStore.getLastUsedIndex(secret, 'test')).toBe(upperStraddleIndex);
  });

  /** Mocks the node into returning one log per entry at the secret's tag for that index, and nothing for other tags. */
  async function mockNodeLogs(logs: { index: number; txHash: TxHash; blockNumber: number }[]) {
    const logsByTag = new Map<string, LogResult[]>();
    for (const { index, txHash, blockNumber } of logs) {
      const tag = await computeSiloedTagForIndex(secret, index);
      const logsOfTag = logsByTag.get(tag.toString()) ?? [];
      logsByTag.set(tag.toString(), [...logsOfTag, randomPrivateLogResult({ txHash, tag: tag.value, blockNumber })]);
    }

    aztecNode.getPrivateLogsByTags.mockImplementation(query =>
      Promise.resolve(extractTags(query).map(tag => logsByTag.get(tag.toString()) ?? [])),
    );
  }

  /**
   * Mocks the node into returning a receipt per given tx, attaching its effect only when asked for one. Asking for the
   * receipt of any other tx throws.
   */
  function mockNodeReceipts(
    receipts: {
      txHash: TxHash;
      status: MinedTxStatus;
      blockNumber?: number;
      executionResult?: TxExecutionResult;
      txEffect?: TxEffect;
    }[],
  ) {
    aztecNode.getTxReceipt.mockImplementation((txHash: TxHash, options?: { includeTxEffect?: boolean }) => {
      const receipt = receipts.find(mocked => mocked.txHash.equals(txHash));
      if (!receipt) {
        throw new Error(`Unexpected tx hash: ${txHash.toString()}`);
      }

      return Promise.resolve(
        minedReceipt(receipt.txHash, receipt.status, receipt.blockNumber ?? FINALIZED_LOG_BLOCK, {
          executionResult: receipt.executionResult,
          txEffect: options?.includeTxEffect ? receipt.txEffect : undefined,
        }),
      );
    });
  }

  function sync({ finalizedAt = MOCK_FINALIZED_BLOCK_NUMBER }: { finalizedAt?: BlockNumber } = {}) {
    return syncSenderTaggingIndexes(secret, aztecNode, taggingStore, finalizedAt, MOCK_ANCHOR_BLOCK_HASH, 'test');
  }
});
