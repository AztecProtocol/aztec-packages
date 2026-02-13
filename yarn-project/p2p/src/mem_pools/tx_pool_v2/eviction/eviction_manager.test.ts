import { BlockNumber } from '@aztec/foundation/branded-types';
import { createLogger } from '@aztec/foundation/log';
import { BlockHeader } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import { type TxMetaData, stubTxMetaValidationData } from '../tx_metadata.js';
import { EvictionManager } from './eviction_manager.js';
import {
  EvictionEvent,
  type EvictionRule,
  type PoolOperations,
  type PreAddPoolAccess,
  type PreAddRule,
} from './interfaces.js';

describe('EvictionManager', () => {
  let pool: MockProxy<PoolOperations>;
  let evictionManager: EvictionManager;
  let mockRule1: MockProxy<EvictionRule>;
  let mockRule2: MockProxy<EvictionRule>;

  beforeEach(() => {
    pool = mock<PoolOperations>();
    evictionManager = new EvictionManager(pool, createLogger('test'));
    mockRule1 = mock<EvictionRule>({ name: 'rule1' });
    mockRule2 = mock<EvictionRule>({ name: 'rule2' });
  });

  describe('evictAfterNewTxs', () => {
    it('calls evict on registered rules with correct context', async () => {
      const newTxHashes = ['0x1111', '0x2222'];
      const feePayers = ['0xfeepayer1', '0xfeepayer2'];

      mockRule1.evict.mockResolvedValue({
        txsEvicted: [],
        reason: 'test',
        success: true,
      });

      evictionManager.registerRule(mockRule1);
      await evictionManager.evictAfterNewTxs(newTxHashes, feePayers);

      expect(mockRule1.evict).toHaveBeenCalledWith(
        {
          event: EvictionEvent.TXS_ADDED,
          newTxHashes,
          feePayers,
        },
        pool,
      );
    });

    it('calls evict on multiple registered rules', async () => {
      const newTxHashes = ['0x1111'];
      const feePayers = ['0xfeepayer1'];

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
      await evictionManager.evictAfterNewTxs(newTxHashes, feePayers);

      expect(mockRule1.evict).toHaveBeenCalledTimes(1);
      expect(mockRule2.evict).toHaveBeenCalledTimes(1);
    });

    it('handles empty newTxHashes array', async () => {
      const newTxHashes: string[] = [];
      const feePayers: string[] = [];

      mockRule1.evict.mockResolvedValue({
        txsEvicted: [],
        reason: 'test',
        success: true,
      });

      evictionManager.registerRule(mockRule1);
      await evictionManager.evictAfterNewTxs(newTxHashes, feePayers);

      expect(mockRule1.evict).toHaveBeenCalledWith(
        {
          event: EvictionEvent.TXS_ADDED,
          newTxHashes,
          feePayers,
        },
        pool,
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
      const newNullifiers = ['0xnull1'];
      const feePayers = ['0xfeepayer1'];
      await evictionManager.evictAfterNewBlock(block, newNullifiers, feePayers);

      expect(mockRule1.evict).toHaveBeenCalledWith(
        {
          event: EvictionEvent.BLOCK_MINED,
          block,
          newNullifiers,
          feePayers,
        },
        pool,
      );
    });

    it('handles empty nullifiers and fee payers arrays', async () => {
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
          feePayers: [],
        },
        pool,
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
      await evictionManager.evictAfterChainPrune(BlockNumber(1));

      expect(mockRule1.evict).toHaveBeenCalledWith(
        {
          event: EvictionEvent.CHAIN_PRUNED,
          blockNumber: BlockNumber(1),
        },
        pool,
      );
    });
  });

  describe('pre-add rules', () => {
    let preAddRule: MockProxy<PreAddRule>;
    let poolAccess: MockProxy<PreAddPoolAccess>;

    const createMeta = (txHash: string, priorityFee: bigint): TxMetaData => ({
      txHash,
      anchorBlockHeaderHash: '0x1234',
      priorityFee,
      feePayer: '0xfeepayer',
      claimAmount: 0n,
      feeLimit: 100n,
      nullifiers: [`0x${txHash.slice(2)}null1`],
      includeByTimestamp: 0n,
      receivedAt: 0,
      data: stubTxMetaValidationData(),
    });

    beforeEach(() => {
      preAddRule = mock<PreAddRule>({ name: 'preAddRule' });
      poolAccess = mock<PreAddPoolAccess>();
    });

    it('runs pre-add rules and returns combined result', async () => {
      preAddRule.check.mockResolvedValue({
        shouldIgnore: false,
        txHashesToEvict: ['0x2222'],
      });

      evictionManager.registerPreAddRule(preAddRule);
      const incomingMeta = createMeta('0x1111', 100n);

      const result = await evictionManager.runPreAddRules(incomingMeta, poolAccess);

      expect(result.shouldIgnore).toBe(false);
      expect(result.txHashesToEvict).toContain('0x2222');
      expect(preAddRule.check).toHaveBeenCalledWith(incomingMeta, poolAccess);
    });

    it('returns ignore result immediately when a rule says to ignore', async () => {
      const preAddRule2 = mock<PreAddRule>({ name: 'preAddRule2' });

      preAddRule.check.mockResolvedValue({
        shouldIgnore: true,
        txHashesToEvict: [],
        reason: 'test reason',
      });
      preAddRule2.check.mockResolvedValue({
        shouldIgnore: false,
        txHashesToEvict: ['0x3333'],
      });

      evictionManager.registerPreAddRule(preAddRule);
      evictionManager.registerPreAddRule(preAddRule2);
      const incomingMeta = createMeta('0x1111', 100n);

      const result = await evictionManager.runPreAddRules(incomingMeta, poolAccess);

      expect(result.shouldIgnore).toBe(true);
      expect(result.reason).toBe('test reason');
      expect(preAddRule.check).toHaveBeenCalledTimes(1);
      // Second rule should not be called since first rule ignored
      expect(preAddRule2.check).not.toHaveBeenCalled();
    });

    it('combines eviction lists from multiple rules', async () => {
      const preAddRule2 = mock<PreAddRule>({ name: 'preAddRule2' });

      preAddRule.check.mockResolvedValue({
        shouldIgnore: false,
        txHashesToEvict: ['0x2222'],
      });
      preAddRule2.check.mockResolvedValue({
        shouldIgnore: false,
        txHashesToEvict: ['0x3333'],
      });

      evictionManager.registerPreAddRule(preAddRule);
      evictionManager.registerPreAddRule(preAddRule2);
      const incomingMeta = createMeta('0x1111', 100n);

      const result = await evictionManager.runPreAddRules(incomingMeta, poolAccess);

      expect(result.shouldIgnore).toBe(false);
      expect(result.txHashesToEvict).toContain('0x2222');
      expect(result.txHashesToEvict).toContain('0x3333');
    });

    it('deduplicates eviction lists', async () => {
      const preAddRule2 = mock<PreAddRule>({ name: 'preAddRule2' });

      preAddRule.check.mockResolvedValue({
        shouldIgnore: false,
        txHashesToEvict: ['0x2222', '0x3333'],
      });
      preAddRule2.check.mockResolvedValue({
        shouldIgnore: false,
        txHashesToEvict: ['0x3333', '0x4444'], // 0x3333 is duplicate
      });

      evictionManager.registerPreAddRule(preAddRule);
      evictionManager.registerPreAddRule(preAddRule2);
      const incomingMeta = createMeta('0x1111', 100n);

      const result = await evictionManager.runPreAddRules(incomingMeta, poolAccess);

      expect(result.shouldIgnore).toBe(false);
      expect(result.txHashesToEvict).toHaveLength(3); // No duplicates
      expect(result.txHashesToEvict).toContain('0x2222');
      expect(result.txHashesToEvict).toContain('0x3333');
      expect(result.txHashesToEvict).toContain('0x4444');
    });
  });

  describe('error handling', () => {
    it('continues execution if a post-event rule throws an error', async () => {
      const newTxHashes = ['0x1111'];
      const feePayers = ['0xfeepayer1'];

      mockRule1.evict.mockRejectedValue(new Error('Rule 1 failed'));
      mockRule2.evict.mockResolvedValue({
        txsEvicted: [],
        reason: 'test2',
        success: true,
      });

      evictionManager.registerRule(mockRule1);
      evictionManager.registerRule(mockRule2);

      await expect(evictionManager.evictAfterNewTxs(newTxHashes, feePayers)).resolves.not.toThrow();

      expect(mockRule1.evict).toHaveBeenCalledTimes(1);
      expect(mockRule2.evict).toHaveBeenCalledTimes(1);
    });

    it('returns ignore result if a pre-add rule throws an error', async () => {
      const preAddRule1 = mock<PreAddRule>({ name: 'failingRule' });
      const preAddRule2 = mock<PreAddRule>({ name: 'secondRule' });
      const poolAccess = mock<PreAddPoolAccess>();

      const createMeta = (txHash: string, priorityFee: bigint): TxMetaData => ({
        txHash,
        anchorBlockHeaderHash: '0x1234',
        priorityFee,
        feePayer: '0xfeepayer',
        claimAmount: 0n,
        feeLimit: 100n,
        nullifiers: [`0x${txHash.slice(2)}null1`],
        includeByTimestamp: 0n,
        receivedAt: 0,
        data: stubTxMetaValidationData(),
      });

      preAddRule1.check.mockRejectedValue(new Error('Rule failed'));
      preAddRule2.check.mockResolvedValue({
        shouldIgnore: false,
        txHashesToEvict: ['0x2222'],
      });

      evictionManager.registerPreAddRule(preAddRule1);
      evictionManager.registerPreAddRule(preAddRule2);

      const incomingMeta = createMeta('0x1111', 100n);
      const result = await evictionManager.runPreAddRules(incomingMeta, poolAccess);

      expect(result.shouldIgnore).toBe(true);
      expect(result.reason).toContain('failingRule');
      expect(result.txHashesToEvict).toHaveLength(0);
      // Second rule should not be called since first rule threw
      expect(preAddRule2.check).not.toHaveBeenCalled();
    });
  });

  describe('rule execution order', () => {
    it('executes post-event rules in registration order', async () => {
      const newTxHashes = ['0x1111'];
      const feePayers = ['0xfeepayer1'];
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

      await evictionManager.evictAfterNewTxs(newTxHashes, feePayers);

      expect(callOrder).toEqual(['rule1', 'rule2']);
    });

    it('waits for each rule to complete before starting the next', async () => {
      const newTxHashes = ['0x1111'];
      const feePayers = ['0xfeepayer1'];

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

      await evictionManager.evictAfterNewTxs(newTxHashes, feePayers);
    });
  });

  describe('no rules registered', () => {
    it('handles evictAfterNewTxs with no rules gracefully', async () => {
      const newTxHashes = ['0x1111'];
      const feePayers = ['0xfeepayer1'];

      await expect(evictionManager.evictAfterNewTxs(newTxHashes, feePayers)).resolves.not.toThrow();
    });

    it('handles evictAfterNewBlock with no rules gracefully', async () => {
      const block = BlockHeader.empty();
      await expect(evictionManager.evictAfterNewBlock(block, [], [])).resolves.not.toThrow();
    });

    it('handles evictAfterChainPrune with no rules gracefully', async () => {
      await expect(evictionManager.evictAfterChainPrune(BlockNumber(1))).resolves.not.toThrow();
    });
  });
});
