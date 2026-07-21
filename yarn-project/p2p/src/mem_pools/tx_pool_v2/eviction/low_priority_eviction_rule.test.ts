import { BlockNumber } from '@aztec/foundation/branded-types';
import { BlockHeader } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';

import type { EvictionContext, PoolOperations } from './interfaces.js';
import { EvictionEvent } from './interfaces.js';
import { LowPriorityEvictionRule } from './low_priority_eviction_rule.js';

describe('LowPriorityEvictionRule', () => {
  let pool: PoolOperations;
  let rule: LowPriorityEvictionRule;

  let deleteTxsMock: jest.MockedFunction<any>;

  // Create mock pool operations
  const createPoolOps = (pendingTxCount: number, lowestPriorityPending: string[] = []): PoolOperations => {
    deleteTxsMock = jest.fn(() => Promise.resolve());
    return {
      getPendingTxs: () => [],
      getPendingFeePayers: () => [],
      getFeePayerPendingTxs: () => [],
      getPendingTxCount: () => pendingTxCount,
      getLowestPriorityPending: () => lowestPriorityPending,
      deleteTxs: deleteTxsMock as (txHashes: string[]) => Promise<void>,
    };
  };

  beforeEach(() => {
    pool = createPoolOps(0);
    rule = new LowPriorityEvictionRule({ maxPoolSize: 100 });
  });

  describe('constructor and configuration', () => {
    it('initializes with provided config', () => {
      expect(rule.name).toBe('LowPriorityEviction');
    });

    it('updates the config', () => {
      rule.updateConfig({ maxPendingTxCount: 200 });
      // Config is updated internally - tested via behavior
    });
  });

  describe('evict method', () => {
    describe('BLOCK_MINED events', () => {
      it('returns empty result for BLOCK_MINED event', async () => {
        const context: EvictionContext = {
          event: EvictionEvent.BLOCK_MINED,
          block: BlockHeader.empty(),
          newNullifiers: [],
          feePayers: [],
        };

        const result = await rule.evict(context, pool);

        expect(result).toEqual({
          reason: 'low_priority',
          success: true,
          txsEvicted: [],
        });
      });
    });

    describe('CHAIN_PRUNED events', () => {
      it('evicts transactions when pool is over limit', async () => {
        rule.updateConfig({ maxPendingTxCount: 2 });
        pool = createPoolOps(4, ['0x3333', '0x4444']);

        const context: EvictionContext = {
          event: EvictionEvent.CHAIN_PRUNED,
          blockNumber: BlockNumber(1),
        };

        const result = await rule.evict(context, pool);

        expect(result.success).toBe(true);
        expect(result.txsEvicted).toEqual(['0x3333', '0x4444']);
        expect(deleteTxsMock).toHaveBeenCalledWith(['0x3333', '0x4444'], 'LowPriorityEviction');
      });

      it('returns empty result when pool is under limit', async () => {
        pool = createPoolOps(50);

        const context: EvictionContext = {
          event: EvictionEvent.CHAIN_PRUNED,
          blockNumber: BlockNumber(1),
        };

        const result = await rule.evict(context, pool);

        expect(result).toEqual({
          reason: 'low_priority',
          success: true,
          txsEvicted: [],
        });
      });

      it('returns empty result when maxPoolSize is 0', async () => {
        rule.updateConfig({ maxPendingTxCount: 0 });

        const context: EvictionContext = {
          event: EvictionEvent.CHAIN_PRUNED,
          blockNumber: BlockNumber(1),
        };

        const result = await rule.evict(context, pool);

        expect(result).toEqual({
          reason: 'low_priority',
          success: true,
          txsEvicted: [],
        });
      });

      it('handles error from pool operations', async () => {
        rule.updateConfig({ maxPendingTxCount: 1 });
        pool = createPoolOps(2, ['0x3333']);
        deleteTxsMock.mockRejectedValue(new Error('Test error'));

        const context: EvictionContext = {
          event: EvictionEvent.CHAIN_PRUNED,
          blockNumber: BlockNumber(1),
        };

        const result = await rule.evict(context, pool);

        expect(result.success).toBe(false);
        expect(result.txsEvicted).toEqual([]);
        expect(result.error?.message).toContain('Failed to evict low priority txs');
      });
    });

    describe('TXS_ADDED events', () => {
      let context: EvictionContext;

      beforeEach(() => {
        context = {
          event: EvictionEvent.TXS_ADDED,
          newTxHashes: ['0x1111', '0x2222'],
          feePayers: [],
        };
      });

      it('returns empty result when maxPoolSize is 0', async () => {
        rule.updateConfig({ maxPendingTxCount: 0 });

        const result = await rule.evict(context, pool);

        expect(result).toEqual({
          reason: 'low_priority',
          success: true,
          txsEvicted: [],
        });
      });

      it('returns empty result when mempool size is below threshold', async () => {
        pool = createPoolOps(50);

        const result = await rule.evict(context, pool);

        expect(result).toEqual({
          reason: 'low_priority',
          success: true,
          txsEvicted: [],
        });
      });

      it('returns empty result when mempool size equals threshold', async () => {
        pool = createPoolOps(100);

        const result = await rule.evict(context, pool);

        expect(result).toEqual({
          reason: 'low_priority',
          success: true,
          txsEvicted: [],
        });
      });

      it('evicts transactions when mempool size exceeds threshold', async () => {
        rule.updateConfig({ maxPendingTxCount: 1 });
        pool = createPoolOps(3, ['0x3333', '0x4444']);

        const result = await rule.evict(context, pool);

        expect(result.success).toBe(true);
        expect(result.txsEvicted).toEqual(['0x3333', '0x4444']);
        expect(deleteTxsMock).toHaveBeenCalledWith(['0x3333', '0x4444'], 'LowPriorityEviction');
      });

      it('tracks newly added transactions that were evicted', async () => {
        rule.updateConfig({ maxPendingTxCount: 1 });
        context = {
          event: EvictionEvent.TXS_ADDED,
          newTxHashes: ['0x1111', '0x2222'],
          feePayers: [],
        };
        pool = createPoolOps(3, ['0x3333', '0x1111']); // One new tx is in eviction list

        const result = await rule.evict(context, pool);

        expect(result.success).toBe(true);
        expect(result.txsEvicted).toEqual(['0x3333', '0x1111']);
        expect(deleteTxsMock).toHaveBeenCalledWith(['0x3333', '0x1111'], 'LowPriorityEviction');
      });

      it('handles all transactions being non-evictable', async () => {
        pool = createPoolOps(101, []); // Over threshold but nothing evictable

        const result = await rule.evict(context, pool);

        expect(result).toEqual({
          reason: 'low_priority',
          success: true,
          txsEvicted: [],
        });
        expect(deleteTxsMock).not.toHaveBeenCalled();
      });

      it('handles error from deleteTxs operation', async () => {
        rule.updateConfig({ maxPendingTxCount: 1 });
        pool = createPoolOps(2, ['0x3333', '0x4444']);
        deleteTxsMock.mockRejectedValue(new Error('Test error'));

        const result = await rule.evict(context, pool);

        expect(result.success).toBe(false);
        expect(result.txsEvicted).toEqual([]);
        expect(result.error?.message).toContain('Failed to evict low priority txs');
      });
    });
  });
});
