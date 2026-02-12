import { type TxMetaData, comparePriority, stubTxMetaValidationData } from '../tx_metadata.js';
import type { PreAddContext, PreAddPoolAccess } from './interfaces.js';
import { LowPriorityPreAddRule } from './low_priority_pre_add_rule.js';

describe('LowPriorityPreAddRule', () => {
  let rule: LowPriorityPreAddRule;

  // Helper to create TxMetaData for testing
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
    estimatedSizeBytes: 0,
    data: stubTxMetaValidationData(),
  });

  // Mock pool access with configurable behavior
  const createPoolAccess = (pendingCount: number, lowestPriorityTx?: TxMetaData): PreAddPoolAccess => ({
    getMetadata: () => undefined,
    getTxHashByNullifier: () => undefined,
    getFeePayerBalance: () => Promise.resolve(10n ** 18n),
    getFeePayerPendingTxs: () => [],
    getPendingTxCount: () => pendingCount,
    getLowestPriorityPendingTx: () => lowestPriorityTx,
  });

  beforeEach(() => {
    rule = new LowPriorityPreAddRule({ maxPoolSize: 100 });
  });

  describe('constructor and configuration', () => {
    it('initializes with provided config', () => {
      expect(rule.name).toBe('LowPriorityPreAdd');
    });

    it('updates the config', () => {
      rule.updateConfig({ maxPendingTxCount: 200 });
      // Config is updated internally - tested via behavior below
    });
  });

  describe('check method', () => {
    describe('when pool is not at capacity', () => {
      it('accepts tx when pool size is below max', async () => {
        const poolAccess = createPoolAccess(50);
        const incomingMeta = createMeta('0x1111', 100n);

        const result = await rule.check(incomingMeta, poolAccess);

        expect(result.shouldIgnore).toBe(false);
        expect(result.txHashesToEvict).toHaveLength(0);
      });

      it('accepts tx when maxPoolSize is 0 (unlimited)', async () => {
        rule.updateConfig({ maxPendingTxCount: 0 });
        const poolAccess = createPoolAccess(1000);
        const incomingMeta = createMeta('0x1111', 100n);

        const result = await rule.check(incomingMeta, poolAccess);

        expect(result.shouldIgnore).toBe(false);
        expect(result.txHashesToEvict).toHaveLength(0);
      });

      it('accepts tx when pool size equals max minus one', async () => {
        const poolAccess = createPoolAccess(99);
        const incomingMeta = createMeta('0x1111', 100n);

        const result = await rule.check(incomingMeta, poolAccess);

        expect(result.shouldIgnore).toBe(false);
        expect(result.txHashesToEvict).toHaveLength(0);
      });
    });

    describe('when pool is at capacity', () => {
      it('evicts lowest priority tx when incoming has higher priority', async () => {
        const lowestPriorityMeta = createMeta('0x2222', 50n);
        const poolAccess = createPoolAccess(100, lowestPriorityMeta);
        const incomingMeta = createMeta('0x1111', 100n);

        const result = await rule.check(incomingMeta, poolAccess);

        expect(result.shouldIgnore).toBe(false);
        expect(result.txHashesToEvict).toContain('0x2222');
        expect(result.txHashesToEvict).toHaveLength(1);
      });

      it('ignores tx when incoming has lower priority than lowest', async () => {
        const lowestPriorityMeta = createMeta('0x2222', 100n);
        const poolAccess = createPoolAccess(100, lowestPriorityMeta);
        const incomingMeta = createMeta('0x1111', 50n);

        const result = await rule.check(incomingMeta, poolAccess);

        expect(result.shouldIgnore).toBe(true);
        expect(result.txHashesToEvict).toHaveLength(0);
        expect(result.reason).toContain('lower priority');
      });

      it('ignores tx when incoming has equal priority to lowest', async () => {
        const lowestPriorityMeta = createMeta('0x2222', 100n);
        const poolAccess = createPoolAccess(100, lowestPriorityMeta);
        const incomingMeta = createMeta('0x1111', 100n);

        const result = await rule.check(incomingMeta, poolAccess);

        expect(result.shouldIgnore).toBe(true);
        expect(result.txHashesToEvict).toHaveLength(0);
      });

      it('accepts tx when no lowest priority tx found (edge case)', async () => {
        // This shouldn't happen if count > 0, but handle gracefully
        const poolAccess = createPoolAccess(100, undefined);
        const incomingMeta = createMeta('0x1111', 100n);

        const result = await rule.check(incomingMeta, poolAccess);

        expect(result.shouldIgnore).toBe(false);
        expect(result.txHashesToEvict).toHaveLength(0);
      });
    });

    describe('after config updates', () => {
      it('respects updated maxPoolSize', async () => {
        // Initially at capacity with max=100
        const lowestPriorityMeta = createMeta('0x2222', 50n);
        const poolAccess = createPoolAccess(100, lowestPriorityMeta);
        const incomingMeta = createMeta('0x1111', 100n);

        // Before update: should evict
        let result = await rule.check(incomingMeta, poolAccess);
        expect(result.shouldIgnore).toBe(false);
        expect(result.txHashesToEvict).toHaveLength(1);

        // Update to larger max
        rule.updateConfig({ maxPendingTxCount: 200 });

        // After update: pool not at capacity, no eviction
        result = await rule.check(incomingMeta, poolAccess);
        expect(result.shouldIgnore).toBe(false);
        expect(result.txHashesToEvict).toHaveLength(0);
      });
    });

    describe('feeOnly context', () => {
      it('uses comparePriority (default): same fee, higher-priority hash evicts existing', async () => {
        // Pick two hashes with the same fee, where incoming has higher priority by hash tiebreaker
        const existing = createMeta('0x1111', 100n);
        const incoming = createMeta('0x2222', 100n);

        // Determine which direction the tiebreaker goes and swap if needed
        const cmp = comparePriority(incoming, existing);
        const [incomingMeta, lowestPriorityMeta] = cmp > 0 ? [incoming, existing] : [existing, incoming];

        const poolAccess = createPoolAccess(100, lowestPriorityMeta);

        // Default context (no feeOnly) — uses full comparePriority
        const result = await rule.check(incomingMeta, poolAccess);

        expect(result.shouldIgnore).toBe(false);
        expect(result.txHashesToEvict).toContain(lowestPriorityMeta.txHash);
      });

      it('uses feeOnly: same fee, incoming is ignored even if it wins hash tiebreaker', async () => {
        const existing = createMeta('0x1111', 100n);
        const incoming = createMeta('0x2222', 100n);

        // Determine which has higher hash priority and use that as incoming
        const cmp = comparePriority(incoming, existing);
        const [incomingMeta, lowestPriorityMeta] = cmp > 0 ? [incoming, existing] : [existing, incoming];

        const poolAccess = createPoolAccess(100, lowestPriorityMeta);
        const context: PreAddContext = { feeOnly: true };

        // feeOnly mode: same fee means ignored (no hash tiebreaker)
        const result = await rule.check(incomingMeta, poolAccess, context);

        expect(result.shouldIgnore).toBe(true);
        expect(result.txHashesToEvict).toHaveLength(0);
      });

      it('higher fee evicts regardless of feeOnly flag', async () => {
        const lowestPriorityMeta = createMeta('0x2222', 50n);
        const poolAccess = createPoolAccess(100, lowestPriorityMeta);
        const incomingMeta = createMeta('0x1111', 100n);

        // Without feeOnly
        const result1 = await rule.check(incomingMeta, poolAccess);
        expect(result1.shouldIgnore).toBe(false);
        expect(result1.txHashesToEvict).toContain('0x2222');

        // With feeOnly
        const result2 = await rule.check(incomingMeta, poolAccess, { feeOnly: true });
        expect(result2.shouldIgnore).toBe(false);
        expect(result2.txHashesToEvict).toContain('0x2222');
      });

      it('lower fee is always ignored regardless of feeOnly flag', async () => {
        const lowestPriorityMeta = createMeta('0x2222', 100n);
        const poolAccess = createPoolAccess(100, lowestPriorityMeta);
        const incomingMeta = createMeta('0x1111', 50n);

        // Without feeOnly
        const result1 = await rule.check(incomingMeta, poolAccess);
        expect(result1.shouldIgnore).toBe(true);

        // With feeOnly
        const result2 = await rule.check(incomingMeta, poolAccess, { feeOnly: true });
        expect(result2.shouldIgnore).toBe(true);
      });
    });
  });
});
