import { Fr } from '@aztec/foundation/fields';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHeader, TxHash } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import { EvictionManager } from './eviction_manager.js';
import { EvictionEvent, type EvictionRule, type TxPoolOperations } from './eviction_strategy.js';

describe('EvictionManager', () => {
  let txPool: MockProxy<TxPoolOperations>;
  let evictionManager: EvictionManager;
  let mockRule1: MockProxy<EvictionRule>;
  let mockRule2: MockProxy<EvictionRule>;

  beforeEach(() => {
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

      mockRule1.evict.mockResolvedValue({
        txsEvicted: [],
        reason: 'test',
        success: true,
      });

      evictionManager.registerRule(mockRule1);
      const nullifier = Fr.random();
      const feePayer = await AztecAddress.random();
      await evictionManager.evictAfterNewBlock(block, [nullifier], [feePayer]);

      expect(mockRule1.evict).toHaveBeenCalledWith(
        {
          event: EvictionEvent.BLOCK_MINED,
          block,
          newNullifiers: [nullifier],
          minedFeePayers: [feePayer],
        },
        txPool,
      );
    });

    it('handles empty nullifiers and fee payers sets', async () => {
      const block = BlockHeader.empty();

      mockRule1.evict.mockResolvedValue({
        txsEvicted: [],
        reason: 'test',
        success: true,
      });

      evictionManager.registerRule(mockRule1);
      await evictionManager.evictAfterNewBlock(block, [], []);

      expect(mockRule1.evict).toHaveBeenCalledWith(
        {
          event: EvictionEvent.BLOCK_MINED,
          block,
          newNullifiers: [],
          minedFeePayers: [],
        },
        txPool,
      );
    });
  });

  describe('evictAfterChainPrune', () => {
    it('calls evict on registered rules with correct context', async () => {
      mockRule1.evict.mockResolvedValue({
        txsEvicted: [],
        reason: 'test',
        success: true,
      });

      evictionManager.registerRule(mockRule1);
      await evictionManager.evictAfterChainPrune(BlockHeader.empty());

      expect(mockRule1.evict).toHaveBeenCalledWith(
        {
          event: EvictionEvent.CHAIN_PRUNED,
          block: BlockHeader.empty(),
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

      mockRule1.evict.mockImplementation(() => {
        callOrder.push('rule1');
        return Promise.resolve({
          txsEvicted: [],
          reason: 'test1',
          success: true,
        });
      });

      mockRule2.evict.mockImplementation(() => {
        callOrder.push('rule2');
        return Promise.resolve({
          txsEvicted: [],
          reason: 'test2',
          success: true,
        });
      });

      evictionManager.registerRule(mockRule1);
      evictionManager.registerRule(mockRule2);

      await evictionManager.evictAfterNewTxs(newTxs, mempoolSize);

      expect(callOrder).toEqual(['rule1', 'rule2']);
    });

    it('waits for each rule to complete before starting the next', async () => {
      const newTxs = [TxHash.random()];
      const mempoolSize = 100;

      mockRule1.evict.mockImplementation(() => {
        expect(mockRule2.evict).not.toHaveBeenCalled();
        return Promise.resolve({
          txsEvicted: [],
          reason: 'test1',
          success: true,
        });
      });

      mockRule2.evict.mockImplementation(() => {
        expect(mockRule1.evict).toHaveBeenCalled();
        return Promise.resolve({
          txsEvicted: [],
          reason: 'test2',
          success: true,
        });
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
      await expect(evictionManager.evictAfterNewBlock(block, [], [])).resolves.not.toThrow();
    });

    it('handles evictAfterChainPrune with no rules gracefully', async () => {
      await expect(evictionManager.evictAfterChainPrune(BlockHeader.empty())).resolves.not.toThrow();
    });
  });
});
