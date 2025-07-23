import { Fr } from '@aztec/foundation/fields';
import { BlockHeader, TxHash } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import { EvictionManager } from './eviction_manager.js';
import { EvictionEvent, type EvictionRule, type TxPoolOperations } from './eviction_strategy.js';

describe('EvictionManager', () => {
  let txPool: MockProxy<TxPoolOperations>;
  let evictionManager: EvictionManager;
  let mockRule1: MockProxy<EvictionRule>;
  let mockRule2: MockProxy<EvictionRule>;

  beforeEach(async () => {
    txPool = mock();
    evictionManager = new EvictionManager(txPool);
    mockRule1 = mock<EvictionRule>({ name: 'rule1' });
    mockRule2 = mock<EvictionRule>({ name: 'rule2' });
  });

  describe('evictAfterNewTxs', () => {
    it('calls evict on registered rules with correct context', async () => {
      const newTxs = [TxHash.random(), TxHash.random()];
      const mempoolSize = 1000;

      mockRule1.evict.mockResolvedValue({
        txsEvicted: [],
        reason: 'test',
        success: true,
      });

      evictionManager.registerRule(mockRule1);
      await evictionManager.evictAfterNewTxs(newTxs, mempoolSize);

      expect(mockRule1.evict).toHaveBeenCalledWith(
        {
          event: EvictionEvent.TXS_ADDED,
          mempoolSize,
          newTxs,
        },
        txPool,
      );
    });

    it('calls evict on multiple registered rules', async () => {
      const newTxs = [TxHash.random()];
      const mempoolSize = 500;

      mockRule1.evict.mockResolvedValue({
        txsEvicted: [],
        reason: 'test1',
        success: true,
      });
      mockRule2.evict.mockResolvedValue({
        txsEvicted: [],
        reason: 'test2',
        success: true,
      });

      evictionManager.registerRule(mockRule1);
      evictionManager.registerRule(mockRule2);
      await evictionManager.evictAfterNewTxs(newTxs, mempoolSize);

      expect(mockRule1.evict).toHaveBeenCalledTimes(1);
      expect(mockRule2.evict).toHaveBeenCalledTimes(1);
    });

    it('handles empty newTxs array', async () => {
      const newTxs: TxHash[] = [];
      const mempoolSize = 0;

      mockRule1.evict.mockResolvedValue({
        txsEvicted: [],
        reason: 'test',
        success: true,
      });

      evictionManager.registerRule(mockRule1);
      await evictionManager.evictAfterNewTxs(newTxs, mempoolSize);

      expect(mockRule1.evict).toHaveBeenCalledWith(
        {
          event: EvictionEvent.TXS_ADDED,
          mempoolSize,
          newTxs,
        },
        txPool,
      );
    });
  });

  describe('evictAfterNewBlock', () => {
    it('calls evict on registered rules with correct context', async () => {
      const block = BlockHeader.empty();
      const newNullifiers = new Set(['nullifier1', 'nullifier2']);
      const feePayers = new Set(['payer1', 'payer2']);

      mockRule1.evict.mockResolvedValue({
        txsEvicted: [],
        reason: 'test',
        success: true,
      });

      evictionManager.registerRule(mockRule1);
      await evictionManager.evictAfterNewBlock(block, newNullifiers, feePayers);

      expect(mockRule1.evict).toHaveBeenCalledWith(
        {
          event: EvictionEvent.BLOCK_MINED,
          block,
          newNullifiers,
          feePayers,
        },
        txPool,
      );
    });

    it('handles empty nullifiers and fee payers sets', async () => {
      const block = BlockHeader.empty();
      const newNullifiers = new Set<string>();
      const feePayers = new Set<string>();

      mockRule1.evict.mockResolvedValue({
        txsEvicted: [],
        reason: 'test',
        success: true,
      });

      evictionManager.registerRule(mockRule1);
      await evictionManager.evictAfterNewBlock(block, newNullifiers, feePayers);

      expect(mockRule1.evict).toHaveBeenCalledWith(
        {
          event: EvictionEvent.BLOCK_MINED,
          block,
          newNullifiers,
          feePayers,
        },
        txPool,
      );
    });
  });

  describe('evictAfterChainPrune', () => {
    it('calls evict on registered rules with correct context', async () => {
      const prunedBlockHashes = [Fr.random(), Fr.random(), Fr.random()];

      mockRule1.evict.mockResolvedValue({
        txsEvicted: [],
        reason: 'test',
        success: true,
      });

      evictionManager.registerRule(mockRule1);
      await evictionManager.evictAfterChainPrune(prunedBlockHashes);

      expect(mockRule1.evict).toHaveBeenCalledWith(
        {
          event: EvictionEvent.CHAIN_PRUNED,
          prunedBlockHashes,
        },
        txPool,
      );
    });

    it('handles empty pruned block hashes array', async () => {
      const prunedBlockHashes: Fr[] = [];

      mockRule1.evict.mockResolvedValue({
        txsEvicted: [],
        reason: 'test',
        success: true,
      });

      evictionManager.registerRule(mockRule1);
      await evictionManager.evictAfterChainPrune(prunedBlockHashes);

      expect(mockRule1.evict).toHaveBeenCalledWith(
        {
          event: EvictionEvent.CHAIN_PRUNED,
          prunedBlockHashes,
        },
        txPool,
      );
    });
  });

  describe('error handling', () => {
    it('continues execution if a rule throws an error', async () => {
      const newTxs = [TxHash.random()];
      const mempoolSize = 100;

      mockRule1.evict.mockRejectedValue(new Error('Rule 1 failed'));
      mockRule2.evict.mockResolvedValue({
        txsEvicted: [],
        reason: 'test2',
        success: true,
      });

      evictionManager.registerRule(mockRule1);
      evictionManager.registerRule(mockRule2);

      await expect(evictionManager.evictAfterNewTxs(newTxs, mempoolSize)).resolves.not.toThrow();

      expect(mockRule1.evict).toHaveBeenCalledTimes(1);
      expect(mockRule2.evict).toHaveBeenCalledTimes(1);
    });
  });

  describe('rule execution order', () => {
    it('executes rules in registration order', async () => {
      const newTxs = [TxHash.random()];
      const mempoolSize = 100;
      const callOrder: string[] = [];

      mockRule1.evict.mockImplementation(async () => {
        callOrder.push('rule1');
        return {
          txsEvicted: [],
          reason: 'test1',
          success: true,
        };
      });

      mockRule2.evict.mockImplementation(async () => {
        callOrder.push('rule2');
        return {
          txsEvicted: [],
          reason: 'test2',
          success: true,
        };
      });

      evictionManager.registerRule(mockRule1);
      evictionManager.registerRule(mockRule2);

      await evictionManager.evictAfterNewTxs(newTxs, mempoolSize);

      expect(callOrder).toEqual(['rule1', 'rule2']);
    });

    it('waits for each rule to complete before starting the next', async () => {
      const newTxs = [TxHash.random()];
      const mempoolSize = 100;
      let rule1Completed = false;

      mockRule1.evict.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        rule1Completed = true;
        return {
          txsEvicted: [],
          reason: 'test1',
          success: true,
        };
      });

      mockRule2.evict.mockImplementation(async () => {
        expect(rule1Completed).toBe(true);
        return {
          txsEvicted: [],
          reason: 'test2',
          success: true,
        };
      });

      evictionManager.registerRule(mockRule1);
      evictionManager.registerRule(mockRule2);

      await evictionManager.evictAfterNewTxs(newTxs, mempoolSize);
    });
  });

  describe('no rules registered', () => {
    it('handles evictAfterNewTxs with no rules gracefully', async () => {
      const newTxs = [TxHash.random()];
      const mempoolSize = 100;

      await expect(evictionManager.evictAfterNewTxs(newTxs, mempoolSize)).resolves.not.toThrow();
    });

    it('handles evictAfterNewBlock with no rules gracefully', async () => {
      const block = BlockHeader.empty();
      const newNullifiers = new Set(['nullifier1']);
      const feePayers = new Set(['payer1']);

      await expect(evictionManager.evictAfterNewBlock(block, newNullifiers, feePayers)).resolves.not.toThrow();
    });

    it('handles evictAfterChainPrune with no rules gracefully', async () => {
      const prunedBlockHashes = [Fr.random()];

      await expect(evictionManager.evictAfterChainPrune(prunedBlockHashes)).resolves.not.toThrow();
    });
  });
});
