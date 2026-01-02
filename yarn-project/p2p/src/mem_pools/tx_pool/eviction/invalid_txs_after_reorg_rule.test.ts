import { Fr } from '@aztec/foundation/curves/bn254';
import type { ReadonlyWorldStateAccess } from '@aztec/stdlib/interfaces/server';
import type { MerkleTreeReadOperations } from '@aztec/stdlib/trees';
import { BlockHeader, TxHash } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import {
  type EvictionContext,
  EvictionEvent,
  type PendingTxInfo,
  type TxBlockReference,
  type TxPoolOperations,
} from './eviction_strategy.js';
import { InvalidTxsAfterReorgRule } from './invalid_txs_after_reorg_rule.js';

describe('InvalidTxsAfterReorgRule', () => {
  let txPool: MockProxy<TxPoolOperations>;
  let worldState: MockProxy<ReadonlyWorldStateAccess>;
  let db: MockProxy<MerkleTreeReadOperations>;
  let rule: InvalidTxsAfterReorgRule;

  beforeEach(() => {
    txPool = mock();
    txPool.getPendingTxInfos.mockResolvedValue([]);

    db = mock<MerkleTreeReadOperations>();
    // default mock implementation - no blocks exist in the tree
    db.findLeafIndices.mockImplementation((_, indices) => Promise.resolve(indices.map(_ => undefined)));

    worldState = mock();
    worldState.getSnapshot.mockReturnValue(db);

    rule = new InvalidTxsAfterReorgRule(worldState);
  });

  describe('evict method', () => {
    describe('non-CHAIN_PRUNED events', () => {
      it('returns empty result for TXS_ADDED event', async () => {
        const context: EvictionContext = {
          event: EvictionEvent.TXS_ADDED,
          newTxs: [],
        };

        const result = await rule.evict(context, txPool);

        expect(result).toEqual({
          reason: 'reorg_invalid_txs',
          success: true,
          txsEvicted: [],
        });
      });

      it('returns empty result for BLOCK_MINED event', async () => {
        const context: EvictionContext = {
          event: EvictionEvent.BLOCK_MINED,
          block: BlockHeader.empty(),
          newNullifiers: [],
          minedFeePayers: [],
        };

        const result = await rule.evict(context, txPool);

        expect(result).toEqual({
          reason: 'reorg_invalid_txs',
          success: true,
          txsEvicted: [],
        });
      });
    });

    describe('CHAIN_PRUNED events', () => {
      it('handles no pending transactions', async () => {
        const context: EvictionContext = {
          event: EvictionEvent.CHAIN_PRUNED,
          blockNumber: 1,
        };

        txPool.getPendingTxInfos.mockResolvedValue([]);
        const result = await rule.evict(context, txPool);

        expect(result).toEqual({
          reason: 'reorg_invalid_txs',
          success: true,
          txsEvicted: [],
        });

        expect(txPool.deleteTxs).not.toHaveBeenCalled();
      });

      it('evicts all transactions that reference pruned blocks', async () => {
        const context: EvictionContext = {
          event: EvictionEvent.CHAIN_PRUNED,
          blockNumber: 1,
        };

        const tx1Hash = TxHash.random();
        const tx2Hash = TxHash.random();
        const headerHash1 = Fr.random();
        const headerHash2 = Fr.random();

        const pendingTxs: PendingTxInfo[] = [
          { txHash: tx1Hash, blockHash: headerHash1, isEvictable: true },
          { txHash: tx2Hash, blockHash: headerHash2, isEvictable: true },
        ];

        txPool.getPendingTxInfos.mockResolvedValue(pendingTxs);

        const result = await rule.evict(context, txPool);

        expect(result.success).toBe(true);
        // Both txs reference pruned blocks
        expect(result.txsEvicted).toContain(tx1Hash);
        expect(result.txsEvicted).toContain(tx2Hash);
      });

      it('respects non-evictable transactions', async () => {
        const context: EvictionContext = {
          event: EvictionEvent.CHAIN_PRUNED,
          blockNumber: 1,
        };

        const evictableTxHash = TxHash.random().toString();
        const nonEvictableTxHash = TxHash.random().toString();
        const headerHash1 = Fr.random();
        const headerHash2 = Fr.random();

        const pendingTxs: PendingTxInfo[] = [
          { txHash: TxHash.fromString(evictableTxHash), blockHash: headerHash1, isEvictable: true },
          { txHash: TxHash.fromString(nonEvictableTxHash), blockHash: headerHash2, isEvictable: false },
        ];

        txPool.getPendingTxInfos.mockResolvedValue(pendingTxs);

        const result = await rule.evict(context, txPool);

        expect(result.success).toBe(true);
        expect(result.txsEvicted).toEqual([TxHash.fromString(evictableTxHash)]); // Only evictable tx is evicted
        expect(txPool.deleteTxs).toHaveBeenCalledWith([TxHash.fromString(evictableTxHash)]);
      });

      it('handles large number of transactions efficiently', async () => {
        const context: EvictionContext = {
          event: EvictionEvent.CHAIN_PRUNED,
          blockNumber: 1,
        };

        const largeTxBlockRefs: TxBlockReference[] = [];

        // Create 1000 transactions
        for (let i = 0; i < 1000; i++) {
          const txHash = TxHash.random();
          const headerHash = Fr.random();
          largeTxBlockRefs.push({ txHash, blockHash: headerHash, isEvictable: true });
        }

        const pendingTxs: PendingTxInfo[] = largeTxBlockRefs.map(ref => ({
          txHash: ref.txHash,
          blockHash: ref.blockHash,
          isEvictable: ref.isEvictable,
        }));

        txPool.getPendingTxInfos.mockResolvedValue(pendingTxs);

        const result = await rule.evict(context, txPool);

        expect(result.success).toBe(true);
        expect(result.txsEvicted.length).toBe(pendingTxs.length);
        expect(txPool.deleteTxs).toHaveBeenCalledWith(result.txsEvicted);
      });

      it('handles error from deleteTxs operation', async () => {
        const context: EvictionContext = {
          event: EvictionEvent.CHAIN_PRUNED,
          blockNumber: 1,
        };

        const txHash = TxHash.random().toString();
        const headerHash = Fr.random();
        const error = new Error('Test error');

        const pendingTxs: PendingTxInfo[] = [
          { txHash: TxHash.fromString(txHash), blockHash: headerHash, isEvictable: true },
        ];

        txPool.getPendingTxInfos.mockResolvedValue(pendingTxs);
        txPool.deleteTxs.mockRejectedValue(error);

        const result = await rule.evict(context, txPool);

        expect(result.success).toBe(false);
        expect(result.error?.cause).toBe(error);
      });
    });

    describe('edge cases', () => {
      it('evicts transactions with valid header hash format', async () => {
        const context: EvictionContext = {
          event: EvictionEvent.CHAIN_PRUNED,
          blockNumber: 1,
        };

        const txHash = TxHash.random().toString();
        const headerHash = Fr.random();

        const pendingTxs: PendingTxInfo[] = [
          { txHash: TxHash.fromString(txHash), blockHash: headerHash, isEvictable: true },
        ];

        txPool.getPendingTxInfos.mockResolvedValue(pendingTxs);

        const result = await rule.evict(context, txPool);

        expect(result.success).toBe(true);
        expect(result.txsEvicted).toEqual([TxHash.fromString(txHash)]);
        expect(txPool.deleteTxs).toHaveBeenCalledWith([TxHash.fromString(txHash)]);
      });

      it('deduplicates block hashes when multiple txs reference the same block', async () => {
        const context: EvictionContext = {
          event: EvictionEvent.CHAIN_PRUNED,
          blockNumber: 1,
        };

        const sharedBlockHash = Fr.random();
        const tx1Hash = TxHash.random();
        const tx2Hash = TxHash.random();
        const tx3Hash = TxHash.random();

        const pendingTxs: PendingTxInfo[] = [
          { txHash: tx1Hash, blockHash: sharedBlockHash, isEvictable: true },
          { txHash: tx2Hash, blockHash: sharedBlockHash, isEvictable: true },
          { txHash: tx3Hash, blockHash: sharedBlockHash, isEvictable: true },
        ];

        txPool.getPendingTxInfos.mockResolvedValue(pendingTxs);

        const result = await rule.evict(context, txPool);

        expect(result.success).toBe(true);
        expect(result.txsEvicted).toHaveLength(3);
        expect(result.txsEvicted).toContain(tx1Hash);
        expect(result.txsEvicted).toContain(tx2Hash);
        expect(result.txsEvicted).toContain(tx3Hash);
        expect(db.findLeafIndices).toHaveBeenCalledTimes(1);
        expect(db.findLeafIndices).toHaveBeenCalledWith(expect.anything(), [sharedBlockHash]);
      });

      it('only evicts txs referencing pruned blocks, keeps txs referencing valid blocks', async () => {
        const context: EvictionContext = {
          event: EvictionEvent.CHAIN_PRUNED,
          blockNumber: 1,
        };

        const validBlockHash = Fr.random();
        const prunedBlockHash = Fr.random();
        const tx1Hash = TxHash.random();
        const tx2Hash = TxHash.random();
        const tx3Hash = TxHash.random();

        const pendingTxs: PendingTxInfo[] = [
          { txHash: tx1Hash, blockHash: validBlockHash, isEvictable: true },
          { txHash: tx2Hash, blockHash: prunedBlockHash, isEvictable: true },
          { txHash: tx3Hash, blockHash: validBlockHash, isEvictable: true },
        ];

        txPool.getPendingTxInfos.mockResolvedValue(pendingTxs);

        db.findLeafIndices.mockImplementation((_, hashes) =>
          Promise.resolve((hashes as Fr[]).map(h => (h.equals(validBlockHash) ? 42n : undefined))),
        );

        const result = await rule.evict(context, txPool);

        expect(result.success).toBe(true);
        expect(result.txsEvicted).toHaveLength(1);
        expect(result.txsEvicted).toContain(tx2Hash);
        expect(result.txsEvicted).not.toContain(tx1Hash);
        expect(result.txsEvicted).not.toContain(tx3Hash);
      });

      it('handles mix of shared and unique block hashes with some valid and some pruned', async () => {
        const context: EvictionContext = {
          event: EvictionEvent.CHAIN_PRUNED,
          blockNumber: 1,
        };

        const validSharedHash = Fr.random();
        const prunedSharedHash = Fr.random();
        const prunedUniqueHash = Fr.random();

        const tx1Hash = TxHash.random();
        const tx2Hash = TxHash.random();
        const tx3Hash = TxHash.random();
        const tx4Hash = TxHash.random();
        const tx5Hash = TxHash.random();

        const pendingTxs: PendingTxInfo[] = [
          { txHash: tx1Hash, blockHash: validSharedHash, isEvictable: true },
          { txHash: tx2Hash, blockHash: validSharedHash, isEvictable: true },
          { txHash: tx3Hash, blockHash: prunedSharedHash, isEvictable: true },
          { txHash: tx4Hash, blockHash: prunedSharedHash, isEvictable: true },
          { txHash: tx5Hash, blockHash: prunedUniqueHash, isEvictable: true },
        ];

        txPool.getPendingTxInfos.mockResolvedValue(pendingTxs);

        db.findLeafIndices.mockImplementation((_, hashes) =>
          Promise.resolve((hashes as Fr[]).map(h => (h.equals(validSharedHash) ? 10n : undefined))),
        );

        const result = await rule.evict(context, txPool);

        expect(result.success).toBe(true);
        expect(result.txsEvicted).toHaveLength(3);
        expect(result.txsEvicted).toContain(tx3Hash);
        expect(result.txsEvicted).toContain(tx4Hash);
        expect(result.txsEvicted).toContain(tx5Hash);
        expect(result.txsEvicted).not.toContain(tx1Hash);
        expect(result.txsEvicted).not.toContain(tx2Hash);
        expect(db.findLeafIndices).toHaveBeenCalledTimes(1);
        const calledHashes = db.findLeafIndices.mock.calls[0][1] as Fr[];
        expect(calledHashes).toHaveLength(3);
      });
    });
  });
});
