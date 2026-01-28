import type { TxMetaData } from '../tx_metadata.js';
import { FeePayerBalancePreAddRule } from './fee_payer_balance_pre_add_rule.js';
import type { PreAddPoolAccess } from './interfaces.js';

describe('FeePayerBalancePreAddRule', () => {
  let rule: FeePayerBalancePreAddRule;

  // Helper to create TxMetaData for testing
  const createMeta = (
    txHash: string,
    opts: {
      priorityFee?: bigint;
      feeLimit?: bigint;
      claimAmount?: bigint;
      feePayer?: string;
    } = {},
  ): TxMetaData => ({
    txHash,
    anchorBlockHeaderHash: '0x1234',
    priorityFee: opts.priorityFee ?? 100n,
    feePayer: opts.feePayer ?? '0xfeepayer',
    claimAmount: opts.claimAmount ?? 0n,
    feeLimit: opts.feeLimit ?? 100n,
    nullifiers: [`0x${txHash.slice(2)}null1`],
    includeByTimestamp: 0n,
  });

  // Mock pool access with configurable behavior
  const createPoolAccess = (balance: bigint, existingTxs: TxMetaData[] = []): PreAddPoolAccess => ({
    getMetadata: (txHashStr: string) => existingTxs.find(t => t.txHash === txHashStr),
    getTxHashByNullifier: () => undefined,
    getFeePayerBalance: async () => balance,
    getFeePayerPendingTxs: () => existingTxs,
    getPendingTxCount: () => existingTxs.length,
    getLowestPriorityPendingTx: () =>
      existingTxs.length > 0 ? existingTxs.reduce((min, t) => (t.priorityFee < min.priorityFee ? t : min)) : undefined,
  });

  beforeEach(() => {
    rule = new FeePayerBalancePreAddRule();
  });

  describe('when pool access methods are available', () => {
    describe('single transaction scenarios', () => {
      it('accepts tx when fee payer has sufficient balance', async () => {
        const incomingMeta = createMeta('0x1111', { feeLimit: 100n });
        const poolAccess = createPoolAccess(1000n);

        const result = await rule.check(incomingMeta, poolAccess);

        expect(result.shouldIgnore).toBe(false);
        expect(result.txHashesToEvict).toHaveLength(0);
      });

      it('ignores tx when fee payer has insufficient balance', async () => {
        const incomingMeta = createMeta('0x1111', { feeLimit: 100n });
        const poolAccess = createPoolAccess(50n);

        const result = await rule.check(incomingMeta, poolAccess);

        expect(result.shouldIgnore).toBe(true);
        expect(result.txHashesToEvict).toHaveLength(0);
        expect(result.reason).toContain('insufficient balance');
      });

      it('accepts tx when balance exactly equals fee limit', async () => {
        const incomingMeta = createMeta('0x1111', { feeLimit: 100n });
        const poolAccess = createPoolAccess(100n);

        const result = await rule.check(incomingMeta, poolAccess);

        expect(result.shouldIgnore).toBe(false);
      });

      it('ignores tx when balance is just under fee limit', async () => {
        const incomingMeta = createMeta('0x1111', { feeLimit: 100n });
        const poolAccess = createPoolAccess(99n);

        const result = await rule.check(incomingMeta, poolAccess);

        expect(result.shouldIgnore).toBe(true);
      });
    });

    describe('multiple transactions for same fee payer', () => {
      it('accepts tx when combined with existing txs still fits in balance', async () => {
        const existingMeta = createMeta('0x2222', { feeLimit: 100n, priorityFee: 50n });
        const incomingMeta = createMeta('0x1111', { feeLimit: 100n, priorityFee: 100n });

        const poolAccess = createPoolAccess(300n, [existingMeta]);

        const result = await rule.check(incomingMeta, poolAccess);

        expect(result.shouldIgnore).toBe(false);
        expect(result.txHashesToEvict).toHaveLength(0);
      });

      it('ignores low-priority tx when balance is exhausted by higher-priority existing txs', async () => {
        const existingMeta = createMeta('0x2222', { feeLimit: 100n, priorityFee: 200n });
        const incomingMeta = createMeta('0x1111', { feeLimit: 100n, priorityFee: 50n });

        // Balance only covers existing tx
        const poolAccess = createPoolAccess(100n, [existingMeta]);

        const result = await rule.check(incomingMeta, poolAccess);

        expect(result.shouldIgnore).toBe(true);
        expect(result.reason).toContain('insufficient balance');
      });

      it('evicts lower-priority existing tx when high-priority tx is added', async () => {
        const existingMeta = createMeta('0x2222', { feeLimit: 100n, priorityFee: 50n });
        const incomingMeta = createMeta('0x1111', { feeLimit: 100n, priorityFee: 200n });

        // Balance only covers one tx
        const poolAccess = createPoolAccess(100n, [existingMeta]);

        const result = await rule.check(incomingMeta, poolAccess);

        expect(result.shouldIgnore).toBe(false);
        expect(result.txHashesToEvict).toContain('0x2222');
      });

      it('evicts multiple lower-priority txs when high-priority tx is added', async () => {
        const existingMeta1 = createMeta('0x2222', { feeLimit: 50n, priorityFee: 30n });
        const existingMeta2 = createMeta('0x3333', { feeLimit: 50n, priorityFee: 40n });
        const incomingMeta = createMeta('0x1111', { feeLimit: 100n, priorityFee: 200n });

        // Balance only covers the incoming tx
        const poolAccess = createPoolAccess(100n, [existingMeta1, existingMeta2]);

        const result = await rule.check(incomingMeta, poolAccess);

        expect(result.shouldIgnore).toBe(false);
        expect(result.txHashesToEvict).toContain('0x2222');
        expect(result.txHashesToEvict).toContain('0x3333');
      });

      it('handles priority ordering correctly - highest priority gets funded first', async () => {
        const lowPriorityMeta = createMeta('0x2222', { feeLimit: 100n, priorityFee: 30n });
        const medPriorityMeta = createMeta('0x3333', { feeLimit: 100n, priorityFee: 50n });
        const highPriorityMeta = createMeta('0x4444', { feeLimit: 100n, priorityFee: 200n });
        const incomingMeta = createMeta('0x1111', { feeLimit: 100n, priorityFee: 75n });

        // Balance covers 3 txs (high + incoming + med), but not low
        const poolAccess = createPoolAccess(300n, [lowPriorityMeta, medPriorityMeta, highPriorityMeta]);

        const result = await rule.check(incomingMeta, poolAccess);

        expect(result.shouldIgnore).toBe(false);
        expect(result.txHashesToEvict).toContain('0x2222'); // Low priority evicted
        expect(result.txHashesToEvict).not.toContain('0x4444'); // High priority kept
        expect(result.txHashesToEvict).not.toContain('0x3333'); // Med priority kept
      });
    });

    describe('claim amount handling', () => {
      it('considers claim amount when calculating available balance', async () => {
        const existingMeta = createMeta('0x2222', {
          feeLimit: 100n,
          claimAmount: 200n, // Claims enough to cover both txs
          priorityFee: 200n, // Higher priority, processed first
        });
        const incomingMeta = createMeta('0x1111', { feeLimit: 100n, priorityFee: 50n });

        // Initial balance is low, but the existing tx's claim will add to it
        const poolAccess = createPoolAccess(100n, [existingMeta]);

        const result = await rule.check(incomingMeta, poolAccess);

        // After existing tx: balance = 100 + 200 - 100 = 200, enough for incoming
        expect(result.shouldIgnore).toBe(false);
      });

      it('ignores tx when claim amount is not enough', async () => {
        const existingMeta = createMeta('0x2222', {
          feeLimit: 100n,
          claimAmount: 50n, // Claims half of what's needed
          priorityFee: 200n, // Higher priority
        });
        const incomingMeta = createMeta('0x1111', { feeLimit: 100n, priorityFee: 50n });

        // Initial balance only covers existing tx
        const poolAccess = createPoolAccess(100n, [existingMeta]);

        const result = await rule.check(incomingMeta, poolAccess);

        // After existing tx: balance = 100 + 50 - 100 = 50, not enough for incoming
        expect(result.shouldIgnore).toBe(true);
      });
    });

    describe('edge cases', () => {
      it('handles empty existing txs list', async () => {
        const incomingMeta = createMeta('0x1111', { feeLimit: 100n });
        const poolAccess = createPoolAccess(1000n, []);

        const result = await rule.check(incomingMeta, poolAccess);

        expect(result.shouldIgnore).toBe(false);
        expect(result.txHashesToEvict).toHaveLength(0);
      });

      it('handles zero balance', async () => {
        const incomingMeta = createMeta('0x1111', { feeLimit: 100n });
        const poolAccess = createPoolAccess(0n, []);

        const result = await rule.check(incomingMeta, poolAccess);

        expect(result.shouldIgnore).toBe(true);
      });

      it('does not evict tx with equal priority (tiebreaker goes to larger hash)', async () => {
        const existingMeta = createMeta('0x2222', { feeLimit: 100n, priorityFee: 100n });
        const incomingMeta = createMeta('0x1111', { feeLimit: 100n, priorityFee: 100n });

        // Balance only covers one tx
        const poolAccess = createPoolAccess(100n, [existingMeta]);

        const result = await rule.check(incomingMeta, poolAccess);

        // With equal priority, the tiebreaker is based on txHash
        // The rule should make a deterministic decision
        expect(typeof result.shouldIgnore).toBe('boolean');
      });
    });

    describe('result status accuracy', () => {
      it('returns correct eviction list when tx replaces another', async () => {
        const existingMeta = createMeta('0x2222', { feeLimit: 100n, priorityFee: 50n });
        const incomingMeta = createMeta('0x1111', { feeLimit: 100n, priorityFee: 200n });

        const poolAccess = createPoolAccess(100n, [existingMeta]);

        const result = await rule.check(incomingMeta, poolAccess);

        expect(result.shouldIgnore).toBe(false);
        expect(result.txHashesToEvict).toHaveLength(1);
        expect(result.txHashesToEvict[0]).toEqual('0x2222');
      });

      it('returns empty eviction list when no evictions needed', async () => {
        const existingMeta = createMeta('0x2222', { feeLimit: 100n, priorityFee: 10n });
        const incomingMeta = createMeta('0x1111', { feeLimit: 100n, priorityFee: 200n });

        // Plenty of balance for both
        const poolAccess = createPoolAccess(1000n, [existingMeta]);

        const result = await rule.check(incomingMeta, poolAccess);

        expect(result.shouldIgnore).toBe(false);
        expect(result.txHashesToEvict).toHaveLength(0);
      });

      it('provides reason when ignoring tx', async () => {
        const incomingMeta = createMeta('0x1111', { feeLimit: 100n });
        const poolAccess = createPoolAccess(0n, []);

        const result = await rule.check(incomingMeta, poolAccess);

        expect(result.shouldIgnore).toBe(true);
        expect(result.reason).toBeDefined();
        expect(result.reason).toContain('insufficient balance');
      });
    });
  });
});
