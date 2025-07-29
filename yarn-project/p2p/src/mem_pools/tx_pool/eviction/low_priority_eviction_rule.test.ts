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
      overflowFactor: 1.2,
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
        expected: { maxPoolSize: 2000, overflowFactor: 1.2 },
      },
      {
        description: 'updates configuration completely',
        update: { maxPoolSize: 500, overflowFactor: 1.5 },
        expected: { maxPoolSize: 500, overflowFactor: 1.5 },
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
          mempoolSize: 1500, // Above threshold (1000 * 1.2 = 1200)
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
        (context as any).mempoolSize = 1000; // Below threshold (1000 * 1.2 = 1200)

        const result = await rule.evict(context, txPool);

        expect(result).toEqual({
          reason: 'low_priority',
          success: true,
          txsEvicted: [],
        });
        expect(txPool.getPendingTxs).not.toHaveBeenCalled();
      });

      it('returns empty result when mempool size equals threshold', async () => {
        (context as any).mempoolSize = 1200; // Equals threshold (1000 * 1.2 = 1200)

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

        (context as any).mempoolSize = 1300; // Target is 1000, so need to evict 300

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

    describe('overflow factor calculations', () => {
      it('uses different overflow factors correctly', async () => {
        const testCases = [
          { factor: 1.0, maxSize: 1000, mempoolSize: 1000, shouldEvict: false }, // At limit
          { factor: 1.0, maxSize: 1000, mempoolSize: 1001, shouldEvict: true }, // Above limit
          { factor: 1.5, maxSize: 1000, mempoolSize: 1500, shouldEvict: false }, // At threshold
          { factor: 1.5, maxSize: 1000, mempoolSize: 1501, shouldEvict: true }, // Above threshold
          { factor: 2.0, maxSize: 500, mempoolSize: 1000, shouldEvict: false }, // At threshold
          { factor: 2.0, maxSize: 500, mempoolSize: 1001, shouldEvict: true }, // Above threshold
        ];

        for (const testCase of testCases) {
          rule.updateConfig({ maxPoolSize: testCase.maxSize, overflowFactor: testCase.factor });

          const context: EvictionContext = {
            event: EvictionEvent.TXS_ADDED,
            mempoolSize: testCase.mempoolSize,
            newTxs: [],
          };

          const tx1 = TxHash.random();
          txPool.getPendingTxs.mockResolvedValue([{ blockHash: Fr.ZERO, txHash: tx1, size: 100, isEvictable: true }]);

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
          mempoolSize: 1500,
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
          mempoolSize: Number.MAX_SAFE_INTEGER,
          newTxs: [],
        };

        txPool.getPendingTxs.mockResolvedValue([{ blockHash: Fr.ZERO, txHash: tx1, size: 1000, isEvictable: true }]);

        const result = await rule.evict(context, txPool);

        expect(result.success).toBe(true);
        expect(result.txsEvicted.length).toBeGreaterThan(0);
      });

      it('handles fractional overflow factors', async () => {
        rule.updateConfig({ maxPoolSize: 1000, overflowFactor: 1.33 });

        const context: EvictionContext = {
          event: EvictionEvent.TXS_ADDED,
          mempoolSize: 1331, // Just above 1000 * 1.33 = 1330
          newTxs: [],
        };

        const tx1 = TxHash.random();
        txPool.getPendingTxs.mockResolvedValue([{ blockHash: Fr.ZERO, txHash: tx1, size: 331, isEvictable: true }]);

        const result = await rule.evict(context, txPool);

        expect(result.success).toBe(true);
        expect(result.txsEvicted).toEqual([tx1]);
      });
    });
  });
});
