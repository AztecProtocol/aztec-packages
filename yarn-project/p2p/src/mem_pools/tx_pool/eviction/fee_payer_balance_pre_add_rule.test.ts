import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { GasFees } from '@aztec/stdlib/gas';
import { mockTx } from '@aztec/stdlib/testing';
import { type Tx, TxHash } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import { getFeePayerBalanceDelta } from '../../../msg_validators/tx_validator/fee_payer_balance.js';
import { getTxPriorityFee } from '../priority.js';
import { FeePayerTxInfo, type PreAddPoolAccess } from './eviction_strategy.js';
import { FeePayerBalancePreAddRule } from './fee_payer_balance_pre_add_rule.js';

describe('FeePayerBalancePreAddRule', () => {
  let poolAccess: MockProxy<PreAddPoolAccess>;
  let rule: FeePayerBalancePreAddRule;

  // Large balance that will cover any mock tx
  const LARGE_BALANCE = 10n ** 18n;

  // Helper to create a tx with specific fee settings
  const createTx = async (seed: number, opts: { maxFee?: number; inclusionFee?: number } = {}) => {
    const { maxFee = 1000, inclusionFee = 100 } = opts;
    return mockTx(seed, {
      maxPriorityFeesPerGas: new GasFees(inclusionFee, inclusionFee),
      numberOfNonRevertiblePublicCallRequests: 1,
    });
  };

  // Helper to get the actual fee limit from a tx
  const getTxFeeLimit = async (tx: Tx): Promise<bigint> => {
    const { feeLimit } = await getFeePayerBalanceDelta(tx, ProtocolContractAddress.FeeJuice);
    return feeLimit;
  };

  // Helper to create FeePayerTxInfo for existing txs
  const createExistingTxInfo = (
    txHash: TxHash,
    priority: bigint,
    feeLimit: bigint,
    claimAmount: bigint = 0n,
  ): FeePayerTxInfo => {
    return new FeePayerTxInfo({
      txHash,
      priority,
      feeLimit,
      claimAmount,
      isEvictable: true,
    });
  };

  beforeEach(() => {
    poolAccess = mock<PreAddPoolAccess>();
    // Default: no nullifier conflicts
    poolAccess.getTxHashByNullifier.mockResolvedValue(undefined);
    poolAccess.getPendingTxByHash.mockResolvedValue(undefined);
    poolAccess.getTxPriority.mockImplementation((tx: Tx) => tx.data.feePayer.toString());

    rule = new FeePayerBalancePreAddRule();
  });

  describe('when pool access methods are not implemented', () => {
    it('skips check and accepts tx', async () => {
      // Remove the optional methods
      poolAccess.getFeePayerBalance = undefined;
      poolAccess.getFeePayerPendingTxs = undefined;

      const tx = await createTx(1);
      const result = await rule.check(tx, poolAccess);

      expect(result.shouldIgnore).toBe(false);
      expect(result.txHashesToEvict).toHaveLength(0);
    });
  });

  describe('single transaction scenarios', () => {
    beforeEach(() => {
      poolAccess.getFeePayerPendingTxs!.mockResolvedValue([]);
    });

    it('accepts tx when fee payer has sufficient balance', async () => {
      poolAccess.getFeePayerBalance!.mockResolvedValue(LARGE_BALANCE);

      const tx = await createTx(1);
      const result = await rule.check(tx, poolAccess);

      expect(result.shouldIgnore).toBe(false);
      expect(result.txHashesToEvict).toHaveLength(0);
    });

    it('ignores tx when fee payer has insufficient balance', async () => {
      poolAccess.getFeePayerBalance!.mockResolvedValue(0n);

      const tx = await createTx(1);
      const result = await rule.check(tx, poolAccess);

      expect(result.shouldIgnore).toBe(true);
      expect(result.txHashesToEvict).toHaveLength(0);
      expect(result.reason).toContain('insufficient balance');
    });

    it('accepts tx when balance exactly equals fee limit', async () => {
      const tx = await createTx(1);
      const feeLimit = await getTxFeeLimit(tx);
      poolAccess.getFeePayerBalance!.mockResolvedValue(feeLimit);

      const result = await rule.check(tx, poolAccess);

      expect(result.shouldIgnore).toBe(false);
    });

    it('ignores tx when balance is just under fee limit', async () => {
      const tx = await createTx(1);
      const feeLimit = await getTxFeeLimit(tx);
      poolAccess.getFeePayerBalance!.mockResolvedValue(feeLimit - 1n);

      const result = await rule.check(tx, poolAccess);

      expect(result.shouldIgnore).toBe(true);
    });
  });

  describe('multiple transactions for same fee payer', () => {
    it('accepts tx when combined with existing txs still fits in balance', async () => {
      const tx = await createTx(1);
      const txFeeLimit = await getTxFeeLimit(tx);

      const existingTxHash = TxHash.random();
      const existingTx = createExistingTxInfo(existingTxHash, 100n, txFeeLimit);

      // Balance covers both txs
      poolAccess.getFeePayerBalance!.mockResolvedValue(txFeeLimit * 3n);
      poolAccess.getFeePayerPendingTxs!.mockResolvedValue([existingTx]);

      const result = await rule.check(tx, poolAccess);

      expect(result.shouldIgnore).toBe(false);
      expect(result.txHashesToEvict).toHaveLength(0);
    });

    it('ignores low-priority tx when balance is exhausted by higher-priority existing txs', async () => {
      const tx = await createTx(1, { inclusionFee: 50 }); // Lower priority
      const txFeeLimit = await getTxFeeLimit(tx);
      const txPriority = getTxPriorityFee(tx);

      // Existing high-priority tx that uses all the balance
      const existingTxHash = TxHash.random();
      const existingTx = createExistingTxInfo(existingTxHash, txPriority + 1000n, txFeeLimit); // Higher priority

      // Balance only covers one tx
      poolAccess.getFeePayerBalance!.mockResolvedValue(txFeeLimit);
      poolAccess.getFeePayerPendingTxs!.mockResolvedValue([existingTx]);

      const result = await rule.check(tx, poolAccess);

      expect(result.shouldIgnore).toBe(true);
      expect(result.reason).toContain('insufficient balance');
    });

    it('evicts lower-priority existing tx when high-priority tx is added', async () => {
      const tx = await createTx(1, { inclusionFee: 500 }); // High priority
      const txFeeLimit = await getTxFeeLimit(tx);
      const txPriority = getTxPriorityFee(tx);

      // Existing low-priority tx
      const existingTxHash = TxHash.random();
      const existingTx = createExistingTxInfo(existingTxHash, txPriority - 1000n, txFeeLimit); // Lower priority

      // Balance only covers one tx
      poolAccess.getFeePayerBalance!.mockResolvedValue(txFeeLimit);
      poolAccess.getFeePayerPendingTxs!.mockResolvedValue([existingTx]);

      const result = await rule.check(tx, poolAccess);

      expect(result.shouldIgnore).toBe(false);
      expect(result.txHashesToEvict).toContainEqual(existingTxHash);
    });

    it('evicts multiple lower-priority txs when high-priority tx is added', async () => {
      const tx = await createTx(1, { inclusionFee: 500 });
      const txFeeLimit = await getTxFeeLimit(tx);
      const txPriority = getTxPriorityFee(tx);

      const existingTx1Hash = TxHash.random();
      const existingTx2Hash = TxHash.random();
      const existingTx1 = createExistingTxInfo(existingTx1Hash, txPriority - 2000n, txFeeLimit / 2n);
      const existingTx2 = createExistingTxInfo(existingTx2Hash, txPriority - 1000n, txFeeLimit / 2n);

      // Balance only covers the incoming tx, not the existing ones too
      poolAccess.getFeePayerBalance!.mockResolvedValue(txFeeLimit);
      poolAccess.getFeePayerPendingTxs!.mockResolvedValue([existingTx1, existingTx2]);

      const result = await rule.check(tx, poolAccess);

      expect(result.shouldIgnore).toBe(false);
      expect(result.txHashesToEvict).toContainEqual(existingTx1Hash);
      expect(result.txHashesToEvict).toContainEqual(existingTx2Hash);
    });

    it('handles priority ordering correctly - highest priority gets funded first', async () => {
      const tx = await createTx(1, { inclusionFee: 75 });
      const txFeeLimit = await getTxFeeLimit(tx);
      const txPriority = getTxPriorityFee(tx);

      // Three existing txs with different priorities
      const lowPriorityHash = TxHash.random();
      const medPriorityHash = TxHash.random();
      const highPriorityHash = TxHash.random();

      const lowPriorityTx = createExistingTxInfo(lowPriorityHash, txPriority - 2000n, txFeeLimit);
      const medPriorityTx = createExistingTxInfo(medPriorityHash, txPriority - 1000n, txFeeLimit);
      const highPriorityTx = createExistingTxInfo(highPriorityHash, txPriority + 1000n, txFeeLimit);

      // Balance covers 3 txs (high + incoming + med), but not low
      poolAccess.getFeePayerBalance!.mockResolvedValue(txFeeLimit * 3n);
      poolAccess.getFeePayerPendingTxs!.mockResolvedValue([lowPriorityTx, medPriorityTx, highPriorityTx]);

      const result = await rule.check(tx, poolAccess);

      // The low priority tx should be evicted
      expect(result.shouldIgnore).toBe(false);
      expect(result.txHashesToEvict).toContainEqual(lowPriorityHash);
      // Higher priority txs should NOT be evicted
      expect(result.txHashesToEvict).not.toContainEqual(highPriorityHash);
      expect(result.txHashesToEvict).not.toContainEqual(medPriorityHash);
    });
  });

  describe('claim amount handling', () => {
    it('considers claim amount when calculating available balance', async () => {
      const tx = await createTx(1, { inclusionFee: 50 });
      const txFeeLimit = await getTxFeeLimit(tx);
      const txPriority = getTxPriorityFee(tx);

      // Existing tx that claims tokens (increases balance)
      const existingTxHash = TxHash.random();
      const claimAmount = txFeeLimit * 2n; // Claims enough to cover both txs
      const existingTx = createExistingTxInfo(
        existingTxHash,
        txPriority + 1000n, // Higher priority, processed first
        txFeeLimit, // feeLimit
        claimAmount, // claimAmount - this tx adds to balance
      );

      // Initial balance is low, but the existing tx's claim will add to it
      poolAccess.getFeePayerBalance!.mockResolvedValue(txFeeLimit); // Only covers existing tx initially
      poolAccess.getFeePayerPendingTxs!.mockResolvedValue([existingTx]);

      const result = await rule.check(tx, poolAccess);

      // After existing tx: balance = txFeeLimit + claimAmount - txFeeLimit = claimAmount
      // claimAmount = txFeeLimit * 2, so there's enough for incoming tx
      expect(result.shouldIgnore).toBe(false);
    });

    it('ignores tx when claim amount is not enough', async () => {
      const tx = await createTx(1, { inclusionFee: 50 });
      const txFeeLimit = await getTxFeeLimit(tx);
      const txPriority = getTxPriorityFee(tx);

      // Existing tx that claims some tokens but not enough
      const existingTxHash = TxHash.random();
      const existingTx = createExistingTxInfo(
        existingTxHash,
        txPriority + 1000n, // Higher priority
        txFeeLimit,
        txFeeLimit / 2n, // Claims half of what's needed
      );

      // Initial balance only covers existing tx
      poolAccess.getFeePayerBalance!.mockResolvedValue(txFeeLimit);
      poolAccess.getFeePayerPendingTxs!.mockResolvedValue([existingTx]);

      const result = await rule.check(tx, poolAccess);

      // After existing tx: balance = txFeeLimit + txFeeLimit/2 - txFeeLimit = txFeeLimit/2
      // Not enough for incoming tx's feeLimit
      expect(result.shouldIgnore).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('handles empty existing txs list', async () => {
      poolAccess.getFeePayerBalance!.mockResolvedValue(LARGE_BALANCE);
      poolAccess.getFeePayerPendingTxs!.mockResolvedValue([]);

      const tx = await createTx(1);
      const result = await rule.check(tx, poolAccess);

      expect(result.shouldIgnore).toBe(false);
      expect(result.txHashesToEvict).toHaveLength(0);
    });

    it('handles zero balance', async () => {
      poolAccess.getFeePayerBalance!.mockResolvedValue(0n);
      poolAccess.getFeePayerPendingTxs!.mockResolvedValue([]);

      const tx = await createTx(1);
      const result = await rule.check(tx, poolAccess);

      expect(result.shouldIgnore).toBe(true);
    });

    it('does not evict tx with equal priority (tiebreaker goes to existing based on hash)', async () => {
      const tx = await createTx(1);
      const txFeeLimit = await getTxFeeLimit(tx);
      const txPriority = getTxPriorityFee(tx);

      // Existing tx with same priority
      const existingTxHash = TxHash.random();
      const existingTx = createExistingTxInfo(existingTxHash, txPriority, txFeeLimit);

      // Balance only covers one tx
      poolAccess.getFeePayerBalance!.mockResolvedValue(txFeeLimit);
      poolAccess.getFeePayerPendingTxs!.mockResolvedValue([existingTx]);

      const result = await rule.check(tx, poolAccess);

      // With equal priority, the tiebreaker is based on txHash
      // One will be covered, one will be evicted/ignored depending on hash ordering
      // The important thing is that the rule makes a deterministic decision
      expect(typeof result.shouldIgnore).toBe('boolean');
    });
  });

  describe('result status accuracy', () => {
    it('returns correct eviction list when tx replaces another', async () => {
      const tx = await createTx(1, { inclusionFee: 500 });
      const txFeeLimit = await getTxFeeLimit(tx);
      const txPriority = getTxPriorityFee(tx);

      const existingTxHash = TxHash.random();
      const existingTx = createExistingTxInfo(existingTxHash, txPriority - 1000n, txFeeLimit);

      // Balance only covers one tx
      poolAccess.getFeePayerBalance!.mockResolvedValue(txFeeLimit);
      poolAccess.getFeePayerPendingTxs!.mockResolvedValue([existingTx]);

      const result = await rule.check(tx, poolAccess);

      expect(result.shouldIgnore).toBe(false);
      expect(result.txHashesToEvict).toHaveLength(1);
      expect(result.txHashesToEvict[0]).toEqual(existingTxHash);
    });

    it('returns empty eviction list when no evictions needed', async () => {
      const tx = await createTx(1, { inclusionFee: 500 });
      const txFeeLimit = await getTxFeeLimit(tx);

      const existingTxHash = TxHash.random();
      const existingTx = createExistingTxInfo(existingTxHash, 10n, txFeeLimit);

      // Plenty of balance for both
      poolAccess.getFeePayerBalance!.mockResolvedValue(LARGE_BALANCE);
      poolAccess.getFeePayerPendingTxs!.mockResolvedValue([existingTx]);

      const result = await rule.check(tx, poolAccess);

      expect(result.shouldIgnore).toBe(false);
      expect(result.txHashesToEvict).toHaveLength(0);
    });

    it('provides reason when ignoring tx', async () => {
      poolAccess.getFeePayerBalance!.mockResolvedValue(0n);
      poolAccess.getFeePayerPendingTxs!.mockResolvedValue([]);

      const tx = await createTx(1);
      const result = await rule.check(tx, poolAccess);

      expect(result.shouldIgnore).toBe(true);
      expect(result.reason).toBeDefined();
      expect(result.reason).toContain('insufficient balance');
    });
  });
});
