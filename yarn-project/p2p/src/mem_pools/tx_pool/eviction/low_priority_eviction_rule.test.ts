import { BlockHeader, TxHash } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import { type EvictionContext, EvictionEvent, type TxPoolOperations } from './eviction_strategy.js';
import { type LowPriorityEvictionConfig, LowPriorityEvictionRule } from './low_priority_eviction_rule.js';

describe('LowPriorityEvictionRule', () => {
  let txPool: MockProxy<TxPoolOperations>;
  let rule: LowPriorityEvictionRule;
  let config: LowPriorityEvictionConfig;

  beforeEach(() => {
    txPool = mock();
    txPool.getPendingTxs.mockResolvedValue([]);
    txPool.getPendingTxCount.mockResolvedValue(0);
    txPool.getLowestPriorityEvictable.mockResolvedValue([]);

    config = {
      maxPoolSize: 100,
    };
    rule = new LowPriorityEvictionRule(config);
  });

  describe('constructor and configuration', () => {
    it('initializes with provided config', () => {
      expect(rule.name).toBe('LowPriorityEviction');
      expect(rule.getConfig()).toEqual(config);
    });

    it('updates the config', () => {
      rule.updateConfig({ maxPoolSize: 200 });
      expect(rule.getConfig()).toEqual({
        maxPoolSize: 200,
      });
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
      });

      it('returns empty result for CHAIN_PRUNED event', async () => {
        const context: EvictionContext = {
          event: EvictionEvent.CHAIN_PRUNED,
          blockNumber: 1,
        };

        const result = await rule.evict(context, txPool);

        expect(result).toEqual({
          reason: 'low_priority',
          success: true,
          txsEvicted: [],
        });
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
      });

      it('returns empty result when mempool size is below threshold', async () => {
        txPool.getPendingTxCount.mockResolvedValue(Math.floor(config.maxPoolSize / 2));

        const result = await rule.evict(context, txPool);

        expect(result).toEqual({
          reason: 'low_priority',
          success: true,
          txsEvicted: [],
        });
      });

      it('returns empty result when mempool size equals threshold', async () => {
        txPool.getPendingTxCount.mockResolvedValue(config.maxPoolSize);

        const result = await rule.evict(context, txPool);

        expect(result).toEqual({
          reason: 'low_priority',
          success: true,
          txsEvicted: [],
        });
      });

      it('evicts transactions when mempool size exceeds threshold', async () => {
        rule.updateConfig({ maxPoolSize: 1 });

        const tx1 = TxHash.random();
        const tx2 = TxHash.random();

        txPool.getPendingTxCount.mockResolvedValue(3);
        txPool.getLowestPriorityEvictable.mockResolvedValue([tx1, tx2]);

        const result = await rule.evict(context, txPool);

        expect(result.success).toBe(true);
        expect(result.txsEvicted).toEqual([tx1, tx2]); // Should evict enough to get below target
        expect(txPool.deleteTxs).toHaveBeenCalledWith([tx1, tx2], true);
      });

      it('tracks newly added transactions that were evicted', async () => {
        rule.updateConfig({ maxPoolSize: 1 });

        const newTx1 = TxHash.random();
        const newTx2 = TxHash.random();
        const oldTx = TxHash.random();

        (context as any).newTxs = [newTx1, newTx2];

        txPool.getPendingTxCount.mockResolvedValue(3);
        txPool.getLowestPriorityEvictable.mockResolvedValue([oldTx, newTx1]);

        const result = await rule.evict(context, txPool);

        expect(result.success).toBe(true);
        expect(result.txsEvicted).toEqual([oldTx, newTx1]);
        expect(txPool.deleteTxs).toHaveBeenCalledWith([oldTx, newTx1], true);
      });

      it('handles all transactions being non-evictable', async () => {
        txPool.getPendingTxCount.mockResolvedValue(config.maxPoolSize + 1);
        txPool.getLowestPriorityEvictable.mockResolvedValue([]);

        const result = await rule.evict(context, txPool);

        expect(result).toEqual({
          reason: 'low_priority',
          success: true,
          txsEvicted: [],
        });
        expect(txPool.deleteTxs).not.toHaveBeenCalled();
        expect(txPool.getLowestPriorityEvictable).toHaveBeenCalledWith(1);
      });

      it('handles error from txPool operations', async () => {
        const error = new Error('Test error');
        txPool.getPendingTxCount.mockRejectedValue(error);

        const result = await rule.evict(context, txPool);

        expect(result.success).toBe(false);
        expect(result.txsEvicted).toEqual([]);
        expect(result.error).toBeInstanceOf(Error);
        expect(result.error?.message).toContain('Failed to evict low priority txs');
        expect(result.error?.cause).toBe(error);
      });

      it('handles error from deleteTxs operation', async () => {
        rule.updateConfig({ maxPoolSize: 1 });
        const t1 = TxHash.random();
        const t2 = TxHash.random();
        txPool.getPendingTxCount.mockResolvedValue(2);
        txPool.getLowestPriorityEvictable.mockResolvedValue([t1, t2]);
        txPool.deleteTxs.mockRejectedValue(new Error('Test error'));

        const result = await rule.evict(context, txPool);

        expect(result.success).toBe(false);
        expect(result.txsEvicted).toEqual([]);
        expect(result.error?.cause).toEqual(new Error('Test error'));
      });
    });
  });
});
