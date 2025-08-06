import { times } from '@aztec/foundation/collection';
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
    txPool.getPendingTxs.mockResolvedValue([]);

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
          block: BlockHeader.empty(),
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
        const pendingTxs = times<PendingTxInfo>(Math.floor(config.maxPoolSize / 2), () => ({
          txHash: TxHash.random(),
          blockHash: Fr.ZERO,
          isEvictable: true,
        }));
        txPool.getPendingTxs.mockResolvedValue(pendingTxs);

        const result = await rule.evict(context, txPool);

        expect(result).toEqual({
          reason: 'low_priority',
          success: true,
          txsEvicted: [],
        });
      });

      it('returns empty result when mempool size equals threshold', async () => {
        const pendingTxs = times<PendingTxInfo>(config.maxPoolSize, () => ({
          txHash: TxHash.random(),
          blockHash: Fr.ZERO,
          isEvictable: true,
        }));
        txPool.getPendingTxs.mockResolvedValue(pendingTxs);

        const result = await rule.evict(context, txPool);

        expect(result).toEqual({
          reason: 'low_priority',
          success: true,
          txsEvicted: [],
        });
        expect(txPool.getPendingTxs).toHaveBeenCalledTimes(1);
      });

      it('evicts transactions when mempool size exceeds threshold', async () => {
        rule.updateConfig({ maxPoolSize: 1 });

        const tx1 = TxHash.random();
        const tx2 = TxHash.random();
        const tx3 = TxHash.random();

        const pendingTxs: PendingTxInfo[] = [
          { blockHash: Fr.ZERO, txHash: tx1, isEvictable: true },
          { blockHash: Fr.ZERO, txHash: tx2, isEvictable: true },
          { blockHash: Fr.ZERO, txHash: tx3, isEvictable: true },
        ];
        txPool.getPendingTxs.mockResolvedValue(pendingTxs);

        const result = await rule.evict(context, txPool);

        expect(result.success).toBe(true);
        expect(result.txsEvicted).toEqual([tx1, tx2]); // Should evict enough to get below target
        expect(txPool.deleteTxs).toHaveBeenCalledWith([tx1, tx2], true);
      });

      it('respects non-evictable transactions', async () => {
        rule.updateConfig({ maxPoolSize: 1 });

        const evictableTx = TxHash.random();
        const nonEvictableTx = TxHash.random();

        const pendingTxs: PendingTxInfo[] = [
          { blockHash: Fr.ZERO, txHash: nonEvictableTx, isEvictable: false },
          { blockHash: Fr.ZERO, txHash: evictableTx, isEvictable: true },
        ];
        txPool.getPendingTxs.mockResolvedValue(pendingTxs);

        const result = await rule.evict(context, txPool);

        expect(result.success).toBe(true);
        expect(result.txsEvicted).toEqual([evictableTx]);
        expect(txPool.deleteTxs).toHaveBeenCalledWith([evictableTx], true);
      });

      it('stops evicting when target size is reached', async () => {
        rule.updateConfig({ maxPoolSize: 1 });

        const tx1 = TxHash.random();
        const tx2 = TxHash.random();
        const tx3 = TxHash.random();

        const pendingTxs: PendingTxInfo[] = [
          { blockHash: Fr.ZERO, txHash: tx1, isEvictable: true },
          { blockHash: Fr.ZERO, txHash: tx2, isEvictable: true }, // This should bring us to exactly 1, at target
          { blockHash: Fr.ZERO, txHash: tx3, isEvictable: true },
        ];
        txPool.getPendingTxs.mockResolvedValue(pendingTxs);

        const result = await rule.evict(context, txPool);

        expect(result.success).toBe(true);
        expect(result.txsEvicted).toEqual([tx1, tx2]);
        expect(txPool.deleteTxs).toHaveBeenCalledWith([tx1, tx2], true);
      });

      it('tracks newly added transactions that were evicted', async () => {
        rule.updateConfig({ maxPoolSize: 1 });

        const newTx1 = TxHash.random();
        const newTx2 = TxHash.random();
        const oldTx = TxHash.random();

        (context as any).newTxs = [newTx1, newTx2];

        const pendingTxs: PendingTxInfo[] = [
          { blockHash: Fr.ZERO, txHash: oldTx, isEvictable: true },
          { blockHash: Fr.ZERO, txHash: newTx1, isEvictable: true },
          { blockHash: Fr.ZERO, txHash: newTx2, isEvictable: true },
        ];
        txPool.getPendingTxs.mockResolvedValue(pendingTxs);

        const result = await rule.evict(context, txPool);

        expect(result.success).toBe(true);
        expect(result.txsEvicted).toEqual([oldTx, newTx1]);
        expect(txPool.deleteTxs).toHaveBeenCalledWith([oldTx, newTx1], true);
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
          { blockHash: Fr.ZERO, txHash: tx1, isEvictable: false },
          { blockHash: Fr.ZERO, txHash: tx2, isEvictable: false },
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
        rule.updateConfig({ maxPoolSize: 1 });
        txPool.getPendingTxs.mockResolvedValue([
          { blockHash: Fr.ZERO, txHash: TxHash.random(), isEvictable: true },
          { blockHash: Fr.ZERO, txHash: TxHash.random(), isEvictable: true },
        ]);
        txPool.deleteTxs.mockRejectedValue(new Error('test error'));

        const result = await rule.evict(context, txPool);

        expect(result.success).toBe(false);
        expect(result.txsEvicted).toEqual([]);
        expect(result.error?.cause).toEqual(new Error('test error'));
      });
    });
  });
});
