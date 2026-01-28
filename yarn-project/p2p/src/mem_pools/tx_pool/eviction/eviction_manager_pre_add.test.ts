import { Fr } from '@aztec/foundation/curves/bn254';
import { GasFees } from '@aztec/stdlib/gas';
import { mockTx } from '@aztec/stdlib/testing';
import { type Tx, TxHash } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import { EvictionManager } from './eviction_manager.js';
import {
  type PreAddEvictionResult,
  type PreAddEvictionRule,
  type PreAddPoolAccess,
  type TxPoolOperations,
} from './eviction_strategy.js';

describe('EvictionManager - Pre-Add Rules Integration', () => {
  let evictionManager: EvictionManager;
  let txPoolOps: MockProxy<TxPoolOperations>;
  let poolAccess: MockProxy<PreAddPoolAccess>;

  // Mock rule that always accepts
  const createAcceptRule = (name: string): PreAddEvictionRule => ({
    name,
    check: async () => ({ shouldIgnore: false, txHashesToEvict: [] }),
  });

  // Mock rule that ignores with a reason
  const createIgnoreRule = (name: string, reason: string): PreAddEvictionRule => ({
    name,
    check: async () => ({ shouldIgnore: true, txHashesToEvict: [], reason }),
  });

  // Mock rule that evicts specific txs
  const createEvictRule = (name: string, txsToEvict: TxHash[]): PreAddEvictionRule => ({
    name,
    check: async () => ({ shouldIgnore: false, txHashesToEvict: txsToEvict }),
  });

  // Mock rule that conditionally ignores based on tx
  const createConditionalRule = (
    name: string,
    shouldIgnoreFn: (tx: Tx) => boolean,
    reason: string,
  ): PreAddEvictionRule => ({
    name,
    check: async (tx: Tx) => ({
      shouldIgnore: shouldIgnoreFn(tx),
      txHashesToEvict: [],
      reason: shouldIgnoreFn(tx) ? reason : undefined,
    }),
  });

  beforeEach(() => {
    txPoolOps = mock<TxPoolOperations>();
    poolAccess = mock<PreAddPoolAccess>();
    evictionManager = new EvictionManager(txPoolOps);
  });

  describe('runPreAddRules', () => {
    it('returns accepted when no rules are registered', async () => {
      const tx = await mockTx(1);
      const result = await evictionManager.runPreAddRules(tx, poolAccess);

      expect(result.shouldIgnore).toBe(false);
      expect(result.txHashesToEvict).toHaveLength(0);
    });

    it('returns accepted when all rules accept', async () => {
      evictionManager.registerPreAddRule(createAcceptRule('rule1'));
      evictionManager.registerPreAddRule(createAcceptRule('rule2'));

      const tx = await mockTx(1);
      const result = await evictionManager.runPreAddRules(tx, poolAccess);

      expect(result.shouldIgnore).toBe(false);
    });

    it('returns ignored when first rule ignores', async () => {
      evictionManager.registerPreAddRule(createIgnoreRule('rule1', 'first rule ignored'));
      evictionManager.registerPreAddRule(createAcceptRule('rule2'));

      const tx = await mockTx(1);
      const result = await evictionManager.runPreAddRules(tx, poolAccess);

      expect(result.shouldIgnore).toBe(true);
      expect(result.reason).toBe('first rule ignored');
    });

    it('returns ignored when second rule ignores', async () => {
      evictionManager.registerPreAddRule(createAcceptRule('rule1'));
      evictionManager.registerPreAddRule(createIgnoreRule('rule2', 'second rule ignored'));

      const tx = await mockTx(1);
      const result = await evictionManager.runPreAddRules(tx, poolAccess);

      expect(result.shouldIgnore).toBe(true);
      expect(result.reason).toBe('second rule ignored');
    });

    it('stops checking rules after first ignore', async () => {
      let rule2Called = false;
      const rule2: PreAddEvictionRule = {
        name: 'rule2',
        check: async () => {
          rule2Called = true;
          return { shouldIgnore: false, txHashesToEvict: [] };
        },
      };

      evictionManager.registerPreAddRule(createIgnoreRule('rule1', 'ignored'));
      evictionManager.registerPreAddRule(rule2);

      const tx = await mockTx(1);
      await evictionManager.runPreAddRules(tx, poolAccess);

      expect(rule2Called).toBe(false);
    });

    it('aggregates evictions from multiple rules', async () => {
      const hash1 = TxHash.random();
      const hash2 = TxHash.random();

      evictionManager.registerPreAddRule(createEvictRule('rule1', [hash1]));
      evictionManager.registerPreAddRule(createEvictRule('rule2', [hash2]));

      const tx = await mockTx(1);
      const result = await evictionManager.runPreAddRules(tx, poolAccess);

      expect(result.shouldIgnore).toBe(false);
      expect(result.txHashesToEvict).toHaveLength(2);
      expect(result.txHashesToEvict).toContainEqual(hash1);
      expect(result.txHashesToEvict).toContainEqual(hash2);
    });

    it('deduplicates evictions from multiple rules', async () => {
      const hash = TxHash.random();

      evictionManager.registerPreAddRule(createEvictRule('rule1', [hash]));
      evictionManager.registerPreAddRule(createEvictRule('rule2', [hash]));

      const tx = await mockTx(1);
      const result = await evictionManager.runPreAddRules(tx, poolAccess);

      expect(result.shouldIgnore).toBe(false);
      expect(result.txHashesToEvict).toHaveLength(1);
    });

    it('returns ignore on rule error', async () => {
      const errorRule: PreAddEvictionRule = {
        name: 'error-rule',
        check: async () => {
          throw new Error('rule error');
        },
      };

      evictionManager.registerPreAddRule(errorRule);

      const tx = await mockTx(1);
      const result = await evictionManager.runPreAddRules(tx, poolAccess);

      expect(result.shouldIgnore).toBe(true);
      expect(result.reason).toContain('rule error');
    });
  });

  describe('multiple rules interaction scenarios', () => {
    it('nullifier conflict rule ignores before fee balance rule runs', async () => {
      // Simulates: incoming tx has nullifier conflict with higher-fee existing tx
      // The nullifier rule should ignore before the fee balance rule even checks
      let feeRuleCalled = false;

      const nullifierRule = createIgnoreRule('nullifier', 'nullifier conflict');
      const feeRule: PreAddEvictionRule = {
        name: 'fee-balance',
        check: async () => {
          feeRuleCalled = true;
          return { shouldIgnore: false, txHashesToEvict: [] };
        },
      };

      evictionManager.registerPreAddRule(nullifierRule);
      evictionManager.registerPreAddRule(feeRule);

      const tx = await mockTx(1);
      const result = await evictionManager.runPreAddRules(tx, poolAccess);

      expect(result.shouldIgnore).toBe(true);
      expect(result.reason).toBe('nullifier conflict');
      expect(feeRuleCalled).toBe(false);
    });

    it('fee balance rule can evict txs that nullifier rule did not flag', async () => {
      // Simulates: incoming high-priority tx passes nullifier check
      // but fee balance rule evicts lower-priority existing txs for same fee payer
      const existingLowPriorityHash = TxHash.random();

      const nullifierRule = createAcceptRule('nullifier');
      const feeRule = createEvictRule('fee-balance', [existingLowPriorityHash]);

      evictionManager.registerPreAddRule(nullifierRule);
      evictionManager.registerPreAddRule(feeRule);

      const tx = await mockTx(1);
      const result = await evictionManager.runPreAddRules(tx, poolAccess);

      expect(result.shouldIgnore).toBe(false);
      expect(result.txHashesToEvict).toContainEqual(existingLowPriorityHash);
    });

    it('combined evictions from nullifier and fee rules', async () => {
      // Simulates: incoming tx evicts conflicting nullifier tx AND
      // evicts low-priority same-fee-payer txs
      const nullifierConflictHash = TxHash.random();
      const lowPriorityFeePayerHash = TxHash.random();

      const nullifierRule = createEvictRule('nullifier', [nullifierConflictHash]);
      const feeRule = createEvictRule('fee-balance', [lowPriorityFeePayerHash]);

      evictionManager.registerPreAddRule(nullifierRule);
      evictionManager.registerPreAddRule(feeRule);

      const tx = await mockTx(1);
      const result = await evictionManager.runPreAddRules(tx, poolAccess);

      expect(result.shouldIgnore).toBe(false);
      expect(result.txHashesToEvict).toHaveLength(2);
      expect(result.txHashesToEvict).toContainEqual(nullifierConflictHash);
      expect(result.txHashesToEvict).toContainEqual(lowPriorityFeePayerHash);
    });
  });

  describe('AddTxsResult status mapping', () => {
    // These tests document how pre-add rule results should map to AddTxsResult
    // The actual mapping happens in the pool, but we verify the rule results here

    it('shouldIgnore: false, no evictions -> accepted', async () => {
      evictionManager.registerPreAddRule(createAcceptRule('rule'));

      const tx = await mockTx(1);
      const result = await evictionManager.runPreAddRules(tx, poolAccess);

      // This should result in 'accepted' in AddTxsResult
      expect(result.shouldIgnore).toBe(false);
      expect(result.txHashesToEvict).toHaveLength(0);
    });

    it('shouldIgnore: false, with evictions -> accepted (evictions handled separately)', async () => {
      const evictHash = TxHash.random();
      evictionManager.registerPreAddRule(createEvictRule('rule', [evictHash]));

      const tx = await mockTx(1);
      const result = await evictionManager.runPreAddRules(tx, poolAccess);

      // This should result in 'accepted' in AddTxsResult
      // The evicted txs are removed but incoming tx is added
      expect(result.shouldIgnore).toBe(false);
      expect(result.txHashesToEvict).toContainEqual(evictHash);
    });

    it('shouldIgnore: true -> ignored (no peer penalty)', async () => {
      evictionManager.registerPreAddRule(createIgnoreRule('rule', 'valid but not desired'));

      const tx = await mockTx(1);
      const result = await evictionManager.runPreAddRules(tx, poolAccess);

      // This should result in 'ignored' in AddTxsResult
      // The tx is valid but we don't want it - NO peer penalty
      expect(result.shouldIgnore).toBe(true);
      expect(result.reason).toBeDefined();
    });
  });
});
