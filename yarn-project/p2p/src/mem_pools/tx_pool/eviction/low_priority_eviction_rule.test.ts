import { Fr } from '@aztec/foundation/fields';
import { BlockHeader, TxHash } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import { type EvictionContext, EvictionEvent, type PendingTxInfo, type TxPoolOperations } from './eviction_strategy.js';
import { type LowPriorityEvictionConfig, LowPriorityEvictionRule } from './low_priority_eviction_rule.js';

describe('LowPriorityEvictionRule', () => {
  let txPool: MockProxy<TxPoolOperations>;
  let rule: LowPriorityEvictionRule;
  let config: LowPriorityEvictionConfig;

  beforeEach(() => {
    txPool = mock();
    config = {
      maxPoolSize: 1000,
    };
    rule = new LowPriorityEvictionRule(config);
  });

  describe('constructor and configuration', () => {
    it('initializes with provided config', () => {
      expect(rule.name).toBe('LowPriorityEviction');
      expect(rule.getConfig()).toEqual(config);
    });

    it.each([
      {
        description: 'updates configuration partially',
        update: { maxPoolSize: 2000 },
        expected: { maxPoolSize: 2000 },
      },
      {
        description: 'updates configuration completely',
        update: { maxPoolSize: 500 },
        expected: { maxPoolSize: 500 },
      },
    ])('$description', ({ update, expected }) => {
      rule.updateConfig(update);
      expect(rule.getConfig()).toEqual(expected);
    });
  });

  describe('evict method', () => {
    describe('non-TXS_ADDED events', () => {
      it('returns empty result for BLOCK_MINED event', async () => {
        const context: EvictionContext = {
          event: EvictionEvent.BLOCK_MINED,
          block: BlockHeader.empty(),
          newNullifiers: [],
          minedFeePayers: [],
        };

        const result = await rule.evict(context, txPool);

        expect(result).toEqual({
          reason: 'low_priority',
          success: true,
          txsEvicted: [],
        });
        expect(txPool.getPendingTxs).not.toHaveBeenCalled();
      });

      it('returns empty result for CHAIN_PRUNED event', async () => {
        const context: EvictionContext = {
          event: EvictionEvent.CHAIN_PRUNED,
          block: BlockHeader.empty(),
        };

        const result = await rule.evict(context, txPool);

        expect(result).toEqual({
          reason: 'low_priority',
          success: true,
          txsEvicted: [],
        });
        expect(txPool.getPendingTxs).not.toHaveBeenCalled();
      });
    });

    describe('TXS_ADDED events', () => {
      let context: EvictionContext;

      beforeEach(() => {
        context = {
          event: EvictionEvent.TXS_ADDED,

          newTxs: [TxHash.random(), TxHash.random()],
        };
      });

      it('returns empty result when maxPoolSize is 0', async () => {
        rule.updateConfig({ maxPoolSize: 0 });

        const result = await rule.evict(context, txPool);

        expect(result).toEqual({
          reason: 'low_priority',
          success: true,
          txsEvicted: [],
        });
        expect(txPool.getPendingTxs).not.toHaveBeenCalled();
      });

      it('returns empty result when mempool size is below threshold', async () => {
        const result = await rule.evict(context, txPool);

        expect(result).toEqual({
          reason: 'low_priority',
          success: true,
          txsEvicted: [],
        });
        expect(txPool.getPendingTxs).not.toHaveBeenCalled();
      });

      it('returns empty result when mempool size equals threshold', async () => {
        const result = await rule.evict(context, txPool);

        expect(result).toEqual({
          reason: 'low_priority',
          success: true,
          txsEvicted: [],
        });
        expect(txPool.getPendingTxs).not.toHaveBeenCalled();
      });

      it('evicts transactions when mempool size exceeds threshold', async () => {
        const tx1 = TxHash.random();
        const tx2 = TxHash.random();
        const tx3 = TxHash.random();

        const pendingTxs: PendingTxInfo[] = [
          { blockHash: Fr.ZERO, txHash: tx1, size: 200, isEvictable: true },
          { blockHash: Fr.ZERO, txHash: tx2, size: 300, isEvictable: true },
          { blockHash: Fr.ZERO, txHash: tx3, size: 100, isEvictable: true },
        ];
        txPool.getPendingTxs.mockResolvedValue(pendingTxs);

        const result = await rule.evict(context, txPool);

        expect(result.success).toBe(true);
        expect(result.txsEvicted).toEqual([tx1, tx2]); // Should evict enough to get below target
        expect(txPool.deleteTxs).toHaveBeenCalledWith([tx1, tx2]);
      });

      it('respects non-evictable transactions', async () => {
        const evictableTx = TxHash.random();
        const nonEvictableTx = TxHash.random();

        const pendingTxs: PendingTxInfo[] = [
          { blockHash: Fr.ZERO, txHash: nonEvictableTx, size: 300, isEvictable: false },
          { blockHash: Fr.ZERO, txHash: evictableTx, size: 300, isEvictable: true },
        ];
        txPool.getPendingTxs.mockResolvedValue(pendingTxs);

        const result = await rule.evict(context, txPool);

        expect(result.success).toBe(true);
        expect(result.txsEvicted).toEqual([evictableTx]);
        expect(txPool.deleteTxs).toHaveBeenCalledWith([evictableTx]);
      });

      it('stops evicting when target size is reached', async () => {
        const tx1 = TxHash.random();
        const tx2 = TxHash.random();
        const tx3 = TxHash.random();

        const pendingTxs: PendingTxInfo[] = [
          { blockHash: Fr.ZERO, txHash: tx1, size: 200, isEvictable: true },
          { blockHash: Fr.ZERO, txHash: tx2, size: 150, isEvictable: true }, // This should bring us to exactly 950, below target
          { blockHash: Fr.ZERO, txHash: tx3, size: 100, isEvictable: true },
        ];
        txPool.getPendingTxs.mockResolvedValue(pendingTxs);

        const result = await rule.evict(context, txPool);

        expect(result.success).toBe(true);
        expect(result.txsEvicted).toEqual([tx1, tx2]); // Should stop at tx2
        expect(txPool.deleteTxs).toHaveBeenCalledWith([tx1, tx2]);
      });

      it('tracks newly added transactions that were evicted', async () => {
        const newTx1 = TxHash.random();
        const newTx2 = TxHash.random();
        const oldTx = TxHash.random();

        (context as any).newTxs = [newTx1, newTx2];

        const pendingTxs: PendingTxInfo[] = [
          { blockHash: Fr.ZERO, txHash: oldTx, size: 200, isEvictable: true },
          { blockHash: Fr.ZERO, txHash: newTx1, size: 200, isEvictable: true },
          { blockHash: Fr.ZERO, txHash: newTx2, size: 200, isEvictable: true },
        ];
        txPool.getPendingTxs.mockResolvedValue(pendingTxs);

        const result = await rule.evict(context, txPool);

        expect(result.success).toBe(true);
        expect(result.txsEvicted).toEqual([oldTx, newTx1, newTx2]);
        expect(txPool.deleteTxs).toHaveBeenCalledWith([oldTx, newTx1, newTx2]);
      });

      it('handles empty pending transactions list', async () => {
        txPool.getPendingTxs.mockResolvedValue([]);

        const result = await rule.evict(context, txPool);

        expect(result).toEqual({
          reason: 'low_priority',
          success: true,
          txsEvicted: [],
        });
        expect(txPool.deleteTxs).not.toHaveBeenCalled();
      });

      it('handles all transactions being non-evictable', async () => {
        const tx1 = TxHash.random();
        const tx2 = TxHash.random();

        txPool.getPendingTxs.mockResolvedValue([
          { blockHash: Fr.ZERO, txHash: tx1, size: 0, isEvictable: false },
          { blockHash: Fr.ZERO, txHash: tx2, size: 0, isEvictable: false },
        ]);

        const result = await rule.evict(context, txPool);

        expect(result).toEqual({
          reason: 'low_priority',
          success: true,
          txsEvicted: [],
        });
        expect(txPool.deleteTxs).not.toHaveBeenCalled();
      });

      it('handles error from txPool operations', async () => {
        const error = new Error('TxPool error');
        txPool.getPendingTxs.mockRejectedValue(error);

        const result = await rule.evict(context, txPool);

        expect(result.success).toBe(false);
        expect(result.txsEvicted).toEqual([]);
        expect(result.error).toBeInstanceOf(Error);
        expect(result.error?.message).toContain('Failed to evict low priority txs');
        expect(result.error?.cause).toBe(error);
      });

      it('handles error from deleteTxs operation', async () => {
        const tx1 = TxHash.random();
        const error = new Error('Delete error');

        txPool.getPendingTxs.mockResolvedValue([{ blockHash: Fr.ZERO, txHash: tx1, size: 200, isEvictable: true }]);
        txPool.deleteTxs.mockRejectedValue(error);

        const result = await rule.evict(context, txPool);

        expect(result.success).toBe(false);
        expect(result.txsEvicted).toEqual([]);
        expect(result.error?.cause).toBe(error);
      });
    });

    describe('transaction count limit', () => {
      it('evicts when transaction count exceeds limit', async () => {
        const testCases = [
          { maxSize: 1000, txCount: 1000, shouldEvict: false }, // At limit
          { maxSize: 1000, txCount: 1001, shouldEvict: true }, // Above limit
          { maxSize: 500, txCount: 500, shouldEvict: false }, // At limit
          { maxSize: 500, txCount: 501, shouldEvict: true }, // Above limit
        ];

        for (const testCase of testCases) {
          rule.updateConfig({ maxPoolSize: testCase.maxSize });

          // Mock getPendingTxs to return testCase.txCount transactions
          const mockTxs = Array.from({ length: testCase.txCount }, () => ({
            txHash: TxHash.random(),
            size: 100,
            blockHash: Fr.random(),
            isEvictable: true,
          }));
          txPool.getPendingTxs.mockResolvedValue(mockTxs);

          const context: EvictionContext = {
            event: EvictionEvent.TXS_ADDED,

            newTxs: [],
          };

          const result = await rule.evict(context, txPool);

          expect(result.success).toBe(true);
          if (testCase.shouldEvict) {
            expect(result.txsEvicted.length).toBeGreaterThan(0);
          } else {
            expect(result.txsEvicted).toEqual([]);
          }
        }
      });
    });

    describe('edge cases', () => {
      it('handles zero-sized transactions', async () => {
        const tx1 = TxHash.random();
        const context: EvictionContext = {
          event: EvictionEvent.TXS_ADDED,

          newTxs: [],
        };

        txPool.getPendingTxs.mockResolvedValue([{ blockHash: Fr.ZERO, txHash: tx1, size: 0, isEvictable: true }]);

        const result = await rule.evict(context, txPool);

        expect(result.success).toBe(true);
        expect(result.txsEvicted).toEqual([tx1]);
      });

      it('handles very large mempool size', async () => {
        const tx1 = TxHash.random();
        const context: EvictionContext = {
          event: EvictionEvent.TXS_ADDED,

          newTxs: [],
        };

        txPool.getPendingTxs.mockResolvedValue([{ blockHash: Fr.ZERO, txHash: tx1, size: 1000, isEvictable: true }]);

        const result = await rule.evict(context, txPool);

        expect(result.success).toBe(true);
        expect(result.txsEvicted.length).toBeGreaterThan(0);
      });

      it('handles exact transaction count limits', async () => {
        rule.updateConfig({ maxPoolSize: 1000 });

        // Mock 1001 transactions (1 over limit)
        const mockTxs = Array.from({ length: 1001 }, () => ({
          txHash: TxHash.random(),
          size: 100,
          blockHash: Fr.random(),
          isEvictable: true,
        }));
        txPool.getPendingTxs.mockResolvedValue(mockTxs);

        const context: EvictionContext = {
          event: EvictionEvent.TXS_ADDED,

          newTxs: [],
        };

        const result = await rule.evict(context, txPool);

        expect(result.success).toBe(true);
        expect(result.txsEvicted.length).toBe(1); // Should evict 1 tx to bring it back to limit
      });
    });
  });
});
