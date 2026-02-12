import { type TxMetaData, stubTxMetaValidationData } from '../tx_metadata.js';
import type { PreAddPoolAccess } from './interfaces.js';
import { NullifierConflictRule } from './nullifier_conflict_rule.js';

describe('NullifierConflictRule', () => {
  let poolAccess: PreAddPoolAccess;
  let rule: NullifierConflictRule;

  // Helper to create TxMetaData for testing
  const createMeta = (
    txHash: string,
    priorityFee: bigint,
    nullifiers: string[] = [`0x${txHash.slice(2)}null1`],
  ): TxMetaData => ({
    txHash,
    anchorBlockHeaderHash: '0x1234',
    priorityFee,
    feePayer: '0xfeepayer',
    claimAmount: 0n,
    feeLimit: 1000n,
    nullifiers,
    includeByTimestamp: 0n,
    data: stubTxMetaValidationData(),
  });

  // Mock pool access with configurable behavior
  const createPoolAccess = (
    nullifierMap: Map<string, string> = new Map(),
    metadataMap: Map<string, TxMetaData> = new Map(),
  ): PreAddPoolAccess => ({
    getMetadata: (txHashStr: string) => metadataMap.get(txHashStr),
    getTxHashByNullifier: (nullifier: string) => nullifierMap.get(nullifier),
    getFeePayerBalance: () => Promise.resolve(10n ** 18n),
    getFeePayerPendingTxs: () => [],
    getPendingTxCount: () => metadataMap.size,
    getLowestPriorityPendingTx: () => undefined,
  });

  beforeEach(() => {
    poolAccess = createPoolAccess();
    rule = new NullifierConflictRule();
  });

  describe('check method', () => {
    describe('no conflicts', () => {
      it('accepts tx when no nullifier conflicts exist', async () => {
        const incomingMeta = createMeta('0x1111', 5n);

        const result = await rule.check(incomingMeta, poolAccess);

        expect(result.shouldIgnore).toBe(false);
        expect(result.txHashesToEvict.length).toBe(0);
      });

      it('accepts tx with different nullifiers than existing txs', async () => {
        const existingMeta = createMeta('0x2222', 10n, ['0xnull_existing']);
        const incomingMeta = createMeta('0x1111', 5n, ['0xnull_incoming']);

        const metadataMap = new Map<string, TxMetaData>();
        metadataMap.set('0x2222', existingMeta);

        const nullifierMap = new Map<string, string>();
        nullifierMap.set('0xnull_existing', '0x2222');

        poolAccess = createPoolAccess(nullifierMap, metadataMap);

        const result = await rule.check(incomingMeta, poolAccess);

        expect(result.shouldIgnore).toBe(false);
        expect(result.txHashesToEvict.length).toBe(0);
      });
    });

    describe('basic conflict resolution', () => {
      it('ignores tx when existing tx has same nullifier with higher fee', async () => {
        const sharedNullifier = '0xshared_null';
        const existingMeta = createMeta('0x2222', 10n, [sharedNullifier]);
        const incomingMeta = createMeta('0x1111', 5n, [sharedNullifier]);

        const metadataMap = new Map<string, TxMetaData>();
        metadataMap.set('0x2222', existingMeta);

        const nullifierMap = new Map<string, string>();
        nullifierMap.set(sharedNullifier, '0x2222');

        poolAccess = createPoolAccess(nullifierMap, metadataMap);

        const result = await rule.check(incomingMeta, poolAccess);

        expect(result.shouldIgnore).toBe(true);
        expect(result.txHashesToEvict.length).toBe(0);
      });

      it('evicts existing tx when incoming tx has same nullifier with higher fee', async () => {
        const sharedNullifier = '0xshared_null';
        const existingMeta = createMeta('0x2222', 5n, [sharedNullifier]);
        const incomingMeta = createMeta('0x1111', 10n, [sharedNullifier]);

        const metadataMap = new Map<string, TxMetaData>();
        metadataMap.set('0x2222', existingMeta);

        const nullifierMap = new Map<string, string>();
        nullifierMap.set(sharedNullifier, '0x2222');

        poolAccess = createPoolAccess(nullifierMap, metadataMap);

        const result = await rule.check(incomingMeta, poolAccess);

        expect(result.shouldIgnore).toBe(false);
        expect(result.txHashesToEvict).toContain('0x2222');
        expect(result.txHashesToEvict.length).toBe(1);
      });

      it('ignores tx with equal fee (no replacement on tie)', async () => {
        const sharedNullifier = '0xshared_null';
        const existingMeta = createMeta('0x2222', 5n, [sharedNullifier]);
        const incomingMeta = createMeta('0x1111', 5n, [sharedNullifier]);

        const metadataMap = new Map<string, TxMetaData>();
        metadataMap.set('0x2222', existingMeta);

        const nullifierMap = new Map<string, string>();
        nullifierMap.set(sharedNullifier, '0x2222');

        poolAccess = createPoolAccess(nullifierMap, metadataMap);

        const result = await rule.check(incomingMeta, poolAccess);

        expect(result.shouldIgnore).toBe(true);
        expect(result.txHashesToEvict.length).toBe(0);
      });
    });

    describe('partial nullifier overlap', () => {
      it('detects conflict when txs share only ONE nullifier', async () => {
        const sharedNullifier = '0xshared_null';
        const existingMeta = createMeta('0x2222', 5n, [sharedNullifier, '0xother_existing']);
        const incomingMeta = createMeta('0x1111', 10n, [sharedNullifier, '0xother_incoming']);

        const metadataMap = new Map<string, TxMetaData>();
        metadataMap.set('0x2222', existingMeta);

        const nullifierMap = new Map<string, string>();
        nullifierMap.set(sharedNullifier, '0x2222');

        poolAccess = createPoolAccess(nullifierMap, metadataMap);

        const result = await rule.check(incomingMeta, poolAccess);

        expect(result.shouldIgnore).toBe(false);
        expect(result.txHashesToEvict).toContain('0x2222');
      });

      it('ignores tx with partial overlap when existing has higher fee', async () => {
        const sharedNullifier = '0xshared_null';
        const existingMeta = createMeta('0x2222', 10n, [sharedNullifier, '0xother_existing']);
        const incomingMeta = createMeta('0x1111', 5n, [sharedNullifier, '0xother_incoming']);

        const metadataMap = new Map<string, TxMetaData>();
        metadataMap.set('0x2222', existingMeta);

        const nullifierMap = new Map<string, string>();
        nullifierMap.set(sharedNullifier, '0x2222');

        poolAccess = createPoolAccess(nullifierMap, metadataMap);

        const result = await rule.check(incomingMeta, poolAccess);

        expect(result.shouldIgnore).toBe(true);
        expect(result.txHashesToEvict.length).toBe(0);
      });
    });

    describe('multiple conflicts', () => {
      it('evicts multiple txs when incoming tx beats all of them', async () => {
        const nullifier1 = '0xnull1';
        const nullifier2 = '0xnull2';
        const existingMeta1 = createMeta('0x2222', 3n, [nullifier1]);
        const existingMeta2 = createMeta('0x3333', 4n, [nullifier2]);
        const incomingMeta = createMeta('0x1111', 10n, [nullifier1, nullifier2]);

        const metadataMap = new Map<string, TxMetaData>();
        metadataMap.set('0x2222', existingMeta1);
        metadataMap.set('0x3333', existingMeta2);

        const nullifierMap = new Map<string, string>();
        nullifierMap.set(nullifier1, '0x2222');
        nullifierMap.set(nullifier2, '0x3333');

        poolAccess = createPoolAccess(nullifierMap, metadataMap);

        const result = await rule.check(incomingMeta, poolAccess);

        expect(result.shouldIgnore).toBe(false);
        expect(result.txHashesToEvict).toContain('0x2222');
        expect(result.txHashesToEvict).toContain('0x3333');
        expect(result.txHashesToEvict.length).toBe(2);
      });

      it('ignores incoming tx if it cannot beat ALL conflicting txs', async () => {
        const nullifier1 = '0xnull1';
        const nullifier2 = '0xnull2';
        const existingMeta1 = createMeta('0x2222', 3n, [nullifier1]);
        const existingMeta2 = createMeta('0x3333', 100n, [nullifier2]); // Higher fee than incoming
        const incomingMeta = createMeta('0x1111', 10n, [nullifier1, nullifier2]);

        const metadataMap = new Map<string, TxMetaData>();
        metadataMap.set('0x2222', existingMeta1);
        metadataMap.set('0x3333', existingMeta2);

        const nullifierMap = new Map<string, string>();
        nullifierMap.set(nullifier1, '0x2222');
        nullifierMap.set(nullifier2, '0x3333');

        poolAccess = createPoolAccess(nullifierMap, metadataMap);

        const result = await rule.check(incomingMeta, poolAccess);

        expect(result.shouldIgnore).toBe(true);
        expect(result.txHashesToEvict.length).toBe(0); // Atomic: no partial evictions
      });
    });

    describe('same tx with multiple shared nullifiers', () => {
      it('handles two txs sharing multiple nullifiers', async () => {
        const nullifier1 = '0xnull1';
        const nullifier2 = '0xnull2';
        const existingMeta = createMeta('0x2222', 5n, [nullifier1, nullifier2]);
        const incomingMeta = createMeta('0x1111', 10n, [nullifier1, nullifier2]);

        const metadataMap = new Map<string, TxMetaData>();
        metadataMap.set('0x2222', existingMeta);

        const nullifierMap = new Map<string, string>();
        nullifierMap.set(nullifier1, '0x2222');
        nullifierMap.set(nullifier2, '0x2222');

        poolAccess = createPoolAccess(nullifierMap, metadataMap);

        const result = await rule.check(incomingMeta, poolAccess);

        expect(result.shouldIgnore).toBe(false);
        expect(result.txHashesToEvict).toContain('0x2222');
        expect(result.txHashesToEvict.length).toBe(1); // Only added once, not duplicated
      });

      it('does not double-count when same tx conflicts on multiple nullifiers', async () => {
        const nullifier1 = '0xnull1';
        const nullifier2 = '0xnull2';
        const nullifier3 = '0xnull3';
        const existingMeta = createMeta('0x2222', 5n, [nullifier1, nullifier2, nullifier3]);
        const incomingMeta = createMeta('0x1111', 10n, [nullifier1, nullifier2, nullifier3]);

        const metadataMap = new Map<string, TxMetaData>();
        metadataMap.set('0x2222', existingMeta);

        const nullifierMap = new Map<string, string>();
        nullifierMap.set(nullifier1, '0x2222');
        nullifierMap.set(nullifier2, '0x2222');
        nullifierMap.set(nullifier3, '0x2222');

        poolAccess = createPoolAccess(nullifierMap, metadataMap);

        const result = await rule.check(incomingMeta, poolAccess);

        expect(result.shouldIgnore).toBe(false);
        expect(result.txHashesToEvict.length).toBe(1); // Existing tx only in array once
      });
    });

    describe('edge cases', () => {
      it('skips self-reference (incoming tx hash in conflict list)', async () => {
        const nullifier = '0xnull1';
        const incomingMeta = createMeta('0x1111', 5n, [nullifier]);

        const nullifierMap = new Map<string, string>();
        nullifierMap.set(nullifier, '0x1111'); // Self-reference

        poolAccess = createPoolAccess(nullifierMap, new Map());

        const result = await rule.check(incomingMeta, poolAccess);

        expect(result.shouldIgnore).toBe(false);
        expect(result.txHashesToEvict.length).toBe(0);
      });

      it('handles missing conflicting tx gracefully', async () => {
        const nullifier = '0xnull1';
        const incomingMeta = createMeta('0x1111', 10n, [nullifier]);

        const nullifierMap = new Map<string, string>();
        nullifierMap.set(nullifier, '0x2222'); // Points to non-existent tx

        poolAccess = createPoolAccess(nullifierMap, new Map()); // Empty metadata map

        const result = await rule.check(incomingMeta, poolAccess);

        expect(result.shouldIgnore).toBe(false);
        expect(result.txHashesToEvict.length).toBe(0);
      });
    });
  });
});
