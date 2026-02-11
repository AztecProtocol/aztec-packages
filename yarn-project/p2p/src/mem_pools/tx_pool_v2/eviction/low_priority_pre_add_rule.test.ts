import { type TxMetaData, stubTxMetaValidationData } from '../tx_metadata.js';
import type { PreAddPoolAccess } from './interfaces.js';
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
  });
});
