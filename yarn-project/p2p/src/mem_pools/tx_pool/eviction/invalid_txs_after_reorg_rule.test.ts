import { Fr } from '@aztec/foundation/fields';
import type { ReadonlyWorldStateAccess } from '@aztec/stdlib/interfaces/server';
import { BlockHeader, TxHash } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import {
  type EvictionContext,
  EvictionEvent,
  type TxBlockReference,
  type TxPoolOperations,
} from './eviction_strategy.js';
import { InvalidTxsAfterReorgRule } from './invalid_txs_after_reorg_rule.js';

describe('InvalidTxsAfterReorgRule', () => {
  let txPool: MockProxy<TxPoolOperations>;
  let worldState: MockProxy<ReadonlyWorldStateAccess>;
  let rule: InvalidTxsAfterReorgRule;

  beforeEach(() => {
    txPool = mock();
    worldState = mock();
    rule = new InvalidTxsAfterReorgRule(worldState);
  });

  describe('evict method', () => {
    describe('non-CHAIN_PRUNED events', () => {
      it('returns empty result for TXS_ADDED event', async () => {
        const context: EvictionContext = {
          event: EvictionEvent.TXS_ADDED,
          mempoolSize: 1000,
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
      it('returns empty result when no pruned block hashes', async () => {
        const context: EvictionContext = {
          event: EvictionEvent.CHAIN_PRUNED,
          block: BlockHeader.empty(),
        };

        const result = await rule.evict(context, txPool);

        expect(result).toEqual({
          reason: 'reorg_invalid_txs',
          success: true,
          txsEvicted: [],
        });
      });

      it('returns empty result when prunedBlockHashes is undefined', async () => {
        const context: EvictionContext = {
          event: EvictionEvent.CHAIN_PRUNED,
          block: BlockHeader.empty(),
        };

        const result = await rule.evict(context, txPool);

        expect(result).toEqual({
          reason: 'reorg_invalid_txs',
          success: true,
          txsEvicted: [],
        });
      });

      it('evicts all transactions that reference pruned blocks', async () => {
        const context: EvictionContext = {
          event: EvictionEvent.CHAIN_PRUNED,
          block: BlockHeader.empty(),
        };

        const tx1Hash = TxHash.random().toString();
        const tx2Hash = TxHash.random().toString();
        const headerHash1 = Fr.random();
        const headerHash2 = Fr.random();

        const txBlockRefs: TxBlockReference[] = [
          { txHash: TxHash.fromString(tx1Hash), blockHash: headerHash1, isEvictable: true },
          { txHash: TxHash.fromString(tx2Hash), blockHash: headerHash2, isEvictable: true },
        ];

        txPool.getPendingTxsReferencingBlocks.mockResolvedValue(txBlockRefs);

        const result = await rule.evict(context, txPool);

        expect(result.success).toBe(true);
        expect(result.txsEvicted).toEqual([TxHash.fromString(tx1Hash), TxHash.fromString(tx2Hash)]); // Both txs reference pruned blocks
        expect(txPool.deleteTxs).toHaveBeenCalledWith([TxHash.fromString(tx1Hash), TxHash.fromString(tx2Hash)]);
      });

      it('respects non-evictable transactions', async () => {
        const context: EvictionContext = {
          event: EvictionEvent.CHAIN_PRUNED,
          block: BlockHeader.empty(),
        };

        const evictableTxHash = TxHash.random().toString();
        const nonEvictableTxHash = TxHash.random().toString();
        const headerHash1 = Fr.random();
        const headerHash2 = Fr.random();

        const txBlockRefs: TxBlockReference[] = [
          { txHash: TxHash.fromString(evictableTxHash), blockHash: headerHash1, isEvictable: true },
          { txHash: TxHash.fromString(nonEvictableTxHash), blockHash: headerHash2, isEvictable: false },
        ];

        txPool.getPendingTxsReferencingBlocks.mockResolvedValue(txBlockRefs);

        const result = await rule.evict(context, txPool);

        expect(result.success).toBe(true);
        expect(result.txsEvicted).toEqual([TxHash.fromString(evictableTxHash)]); // Only evictable tx is evicted
        expect(txPool.deleteTxs).toHaveBeenCalledWith([TxHash.fromString(evictableTxHash)]);
      });

      it('deletes all transactions referencing pruned blocks without checking existence', async () => {
        const context: EvictionContext = {
          event: EvictionEvent.CHAIN_PRUNED,
          block: BlockHeader.empty(),
        };

        const tx1Hash = TxHash.random().toString();
        const tx2Hash = TxHash.random().toString();
        const headerHash1 = Fr.random();
        const headerHash2 = Fr.random();

        const txBlockRefs: TxBlockReference[] = [
          { txHash: TxHash.fromString(tx1Hash), blockHash: headerHash1, isEvictable: true },
          { txHash: TxHash.fromString(tx2Hash), blockHash: headerHash2, isEvictable: true },
        ];

        txPool.getPendingTxsReferencingBlocks.mockResolvedValue(txBlockRefs);

        const result = await rule.evict(context, txPool);

        expect(result.success).toBe(true);
        expect(result.txsEvicted).toEqual([TxHash.fromString(tx1Hash), TxHash.fromString(tx2Hash)]); // Both txs sent for deletion
        expect(txPool.deleteTxs).toHaveBeenCalledWith([TxHash.fromString(tx1Hash), TxHash.fromString(tx2Hash)]);
        expect(txPool.getTxByHash).not.toHaveBeenCalled(); // No database lookups needed
      });

      it('handles empty pending transactions map', async () => {
        const context: EvictionContext = {
          event: EvictionEvent.CHAIN_PRUNED,
          block: BlockHeader.empty(),
        };

        txPool.getPendingTxsReferencingBlocks.mockResolvedValue([]);

        const result = await rule.evict(context, txPool);

        expect(result).toEqual({
          reason: 'reorg_invalid_txs',
          success: true,
          txsEvicted: [],
        });
        expect(txPool.deleteTxs).not.toHaveBeenCalled();
      });

      it('handles large number of transactions efficiently', async () => {
        const context: EvictionContext = {
          event: EvictionEvent.CHAIN_PRUNED,
          block: BlockHeader.empty(),
        };

        const largeTxBlockRefs: TxBlockReference[] = [];

        // Create 1000 transactions
        for (let i = 0; i < 1000; i++) {
          const txHash = TxHash.random();
          const headerHash = Fr.random();
          largeTxBlockRefs.push({ txHash, blockHash: headerHash, isEvictable: true });
        }

        txPool.getPendingTxsReferencingBlocks.mockResolvedValue(largeTxBlockRefs);

        const result = await rule.evict(context, txPool);

        expect(result.success).toBe(true);
        expect(result.txsEvicted.length).toBe(1000); // All transactions reference pruned blocks
        expect(txPool.deleteTxs).toHaveBeenCalledWith(result.txsEvicted);
      });

      it('handles error from deleteTxs operation', async () => {
        const context: EvictionContext = {
          event: EvictionEvent.CHAIN_PRUNED,
          block: BlockHeader.empty(),
        };

        const txHash = TxHash.random().toString();
        const headerHash = Fr.random();
        const error = new Error('Delete failed');

        txPool.getPendingTxsReferencingBlocks.mockResolvedValue([
          { txHash: TxHash.fromString(txHash), blockHash: headerHash, isEvictable: true },
        ]);
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
          block: BlockHeader.empty(),
        };

        const txHash = TxHash.random().toString();
        const headerHash = Fr.random();

        txPool.getPendingTxsReferencingBlocks.mockResolvedValue([
          { txHash: TxHash.fromString(txHash), blockHash: headerHash, isEvictable: true },
        ]);

        const result = await rule.evict(context, txPool);

        expect(result.success).toBe(true);
        expect(result.txsEvicted).toEqual([TxHash.fromString(txHash)]);
        expect(txPool.deleteTxs).toHaveBeenCalledWith([TxHash.fromString(txHash)]);
      });
    });
  });
});
