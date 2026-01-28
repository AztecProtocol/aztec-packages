import { Fr } from '@aztec/foundation/curves/bn254';
import { GasFees } from '@aztec/stdlib/gas';
import { mockTx } from '@aztec/stdlib/testing';
import { type Tx, TxHash } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import { getPendingTxPriority } from '../priority.js';
import type { PreAddPoolAccess } from './eviction_strategy.js';
import { NullifierConflictPreAddRule } from './nullifier_conflict_pre_add_rule.js';

describe('NullifierConflictPreAddRule', () => {
  let poolAccess: MockProxy<PreAddPoolAccess>;
  let rule: NullifierConflictPreAddRule;

  // Tx type alias for cleaner type annotations
  type MockTx = Awaited<ReturnType<typeof mockTx>>;

  // Helper to create a public tx (forPublic path) with a specific fee
  const mockPublicTx = (seed: number, fee: number) =>
    mockTx(seed, {
      maxPriorityFeesPerGas: new GasFees(fee, fee),
      numberOfNonRevertiblePublicCallRequests: 1,
    });

  // Helper to create a private-only tx (forRollup path) with a specific fee
  const mockPrivateTx = (seed: number, fee: number) =>
    mockTx(seed, {
      maxPriorityFeesPerGas: new GasFees(fee, fee),
      numberOfNonRevertiblePublicCallRequests: 0,
      numberOfRevertiblePublicCallRequests: 0,
    });

  // Helper to set a specific nullifier on a transaction
  const setNullifier = (tx: MockTx, index: number, value: Fr) => {
    if (tx.data.forPublic) {
      tx.data.forPublic.nonRevertibleAccumulatedData.nullifiers[index] = value;
    } else if (tx.data.forRollup) {
      tx.data.forRollup.end.nullifiers[index] = value;
    }
  };

  const getNullifier = (tx: MockTx, index: number): Fr => {
    if (tx.data.forPublic) {
      return tx.data.forPublic.nonRevertibleAccumulatedData.nullifiers[index];
    } else if (tx.data.forRollup) {
      return tx.data.forRollup.end.nullifiers[index];
    }
    throw new Error('Transaction has no nullifiers');
  };

  beforeEach(() => {
    poolAccess = mock<PreAddPoolAccess>();
    poolAccess.getTxHashByNullifier.mockResolvedValue(undefined);
    poolAccess.getPendingTxByHash.mockResolvedValue(undefined);
    poolAccess.getTxPriority.mockImplementation((tx: Tx) => getPendingTxPriority(tx));

    rule = new NullifierConflictPreAddRule();
  });

  describe('check method', () => {
    describe('no conflicts', () => {
      it('accepts tx when no nullifier conflicts exist', async () => {
        const tx = await mockPublicTx(1, 5);

        const result = await rule.check(tx, poolAccess);

        expect(result.shouldReject).toBe(false);
        expect(result.txHashesToEvict.length).toBe(0);
      });

      it('accepts tx with different nullifiers than existing txs', async () => {
        const tx = await mockPublicTx(1, 5);

        // No conflicts - getTxHashesByNullifier returns empty for all nullifiers
        const result = await rule.check(tx, poolAccess);

        expect(result.shouldReject).toBe(false);
        expect(result.txHashesToEvict.length).toBe(0);
      });
    });

    describe('basic conflict resolution', () => {
      it('rejects tx when existing tx has same nullifier with higher fee', async () => {
        const existingTx = await mockPublicTx(1, 10);
        const incomingTx = await mockPublicTx(2, 5);

        setNullifier(incomingTx, 0, getNullifier(existingTx, 0));

        const existingHash = existingTx.getTxHash();

        poolAccess.getTxHashByNullifier.mockResolvedValue(existingHash);
        poolAccess.getPendingTxByHash.mockResolvedValue(existingTx);

        const result = await rule.check(incomingTx, poolAccess);

        expect(result.shouldReject).toBe(true);
        expect(result.txHashesToEvict.length).toBe(0);
      });

      it('evicts existing tx when incoming tx has same nullifier with higher fee', async () => {
        const existingTx = await mockPublicTx(1, 5);
        const incomingTx = await mockPublicTx(2, 10);

        setNullifier(incomingTx, 0, getNullifier(existingTx, 0));

        const existingHash = existingTx.getTxHash();

        poolAccess.getTxHashByNullifier.mockResolvedValue(existingHash);
        poolAccess.getPendingTxByHash.mockResolvedValue(existingTx);

        const result = await rule.check(incomingTx, poolAccess);

        expect(result.shouldReject).toBe(false);
        expect(result.txHashesToEvict.some(h => h.equals(existingHash))).toBe(true);
        expect(result.txHashesToEvict.length).toBe(1);
      });

      it('rejects tx with equal fee (no replacement on tie)', async () => {
        const existingTx = await mockPublicTx(1, 5);
        const incomingTx = await mockPublicTx(2, 5);

        setNullifier(incomingTx, 0, getNullifier(existingTx, 0));

        const existingHash = existingTx.getTxHash();

        poolAccess.getTxHashByNullifier.mockResolvedValue(existingHash);
        poolAccess.getPendingTxByHash.mockResolvedValue(existingTx);

        const result = await rule.check(incomingTx, poolAccess);

        expect(result.shouldReject).toBe(true);
        expect(result.txHashesToEvict.length).toBe(0);
      });
    });

    describe('forPublic vs forRollup paths', () => {
      it('handles nullifier conflicts for private-only txs (forRollup path)', async () => {
        const existingTx = await mockPrivateTx(1, 5);
        const incomingTx = await mockPrivateTx(2, 10);

        expect(existingTx.data.forRollup).toBeDefined();
        expect(incomingTx.data.forRollup).toBeDefined();

        setNullifier(incomingTx, 0, getNullifier(existingTx, 0));

        const existingHash = existingTx.getTxHash();

        poolAccess.getTxHashByNullifier.mockResolvedValue(existingHash);
        poolAccess.getPendingTxByHash.mockResolvedValue(existingTx);

        const result = await rule.check(incomingTx, poolAccess);

        expect(result.shouldReject).toBe(false);
        expect(result.txHashesToEvict.some(h => h.equals(existingHash))).toBe(true);
      });

      it('handles nullifier conflicts between forPublic and forRollup txs', async () => {
        const existingTx = await mockPublicTx(1, 5);
        const incomingTx = await mockPrivateTx(2, 10);

        expect(existingTx.data.forPublic).toBeDefined();
        expect(incomingTx.data.forRollup).toBeDefined();

        setNullifier(incomingTx, 0, getNullifier(existingTx, 0));

        const existingHash = existingTx.getTxHash();

        poolAccess.getTxHashByNullifier.mockResolvedValue(existingHash);
        poolAccess.getPendingTxByHash.mockResolvedValue(existingTx);

        const result = await rule.check(incomingTx, poolAccess);

        expect(result.shouldReject).toBe(false);
        expect(result.txHashesToEvict.some(h => h.equals(existingHash))).toBe(true);
      });
    });

    describe('partial nullifier overlap', () => {
      it('detects conflict when txs share only ONE nullifier', async () => {
        const existingTx = await mockPublicTx(1, 5);
        const incomingTx = await mockPublicTx(2, 10);

        // Give both txs second nullifiers, share only first
        setNullifier(existingTx, 1, Fr.random());
        setNullifier(incomingTx, 0, getNullifier(existingTx, 0));
        setNullifier(incomingTx, 1, Fr.random());

        const existingHash = existingTx.getTxHash();

        // Only return conflict for the shared nullifier
        poolAccess.getTxHashByNullifier.mockImplementation(nullifier => {
          if (nullifier.equals(getNullifier(existingTx, 0))) {
            return Promise.resolve(existingHash);
          }
          return Promise.resolve(undefined);
        });
        poolAccess.getPendingTxByHash.mockResolvedValue(existingTx);

        const result = await rule.check(incomingTx, poolAccess);

        expect(result.shouldReject).toBe(false);
        expect(result.txHashesToEvict.some(h => h.equals(existingHash))).toBe(true);
      });

      it('rejects tx with partial overlap when existing has higher fee', async () => {
        const existingTx = await mockPublicTx(1, 10);
        const incomingTx = await mockPublicTx(2, 5);

        setNullifier(existingTx, 1, Fr.random());
        setNullifier(incomingTx, 0, getNullifier(existingTx, 0));
        setNullifier(incomingTx, 1, Fr.random());

        const existingHash = existingTx.getTxHash();

        poolAccess.getTxHashByNullifier.mockImplementation(nullifier => {
          if (nullifier.equals(getNullifier(existingTx, 0))) {
            return Promise.resolve(existingHash);
          }
          return Promise.resolve(undefined);
        });
        poolAccess.getPendingTxByHash.mockResolvedValue(existingTx);

        const result = await rule.check(incomingTx, poolAccess);

        expect(result.shouldReject).toBe(true);
        expect(result.txHashesToEvict.length).toBe(0);
      });
    });

    describe('multiple conflicts', () => {
      it('evicts multiple txs when incoming tx beats all of them', async () => {
        const existingTx1 = await mockPublicTx(1, 3);
        const existingTx2 = await mockPublicTx(2, 4);
        const incomingTx = await mockPublicTx(3, 10);

        // incoming tx shares nullifiers with both existing txs
        setNullifier(incomingTx, 0, getNullifier(existingTx1, 0));
        setNullifier(incomingTx, 1, getNullifier(existingTx2, 0));

        const existingHash1 = existingTx1.getTxHash();
        const existingHash2 = existingTx2.getTxHash();

        poolAccess.getTxHashByNullifier.mockImplementation(nullifier => {
          if (nullifier.equals(getNullifier(existingTx1, 0))) {
            return Promise.resolve(existingHash1);
          }
          if (nullifier.equals(getNullifier(existingTx2, 0))) {
            return Promise.resolve(existingHash2);
          }
          return Promise.resolve(undefined);
        });
        poolAccess.getPendingTxByHash.mockImplementation(hash => {
          if (hash.equals(existingHash1)) {
            return Promise.resolve(existingTx1);
          }
          if (hash.equals(existingHash2)) {
            return Promise.resolve(existingTx2);
          }
          return Promise.resolve(undefined);
        });

        const result = await rule.check(incomingTx, poolAccess);

        expect(result.shouldReject).toBe(false);
        expect(result.txHashesToEvict.some(h => h.equals(existingHash1))).toBe(true);
        expect(result.txHashesToEvict.some(h => h.equals(existingHash2))).toBe(true);
        expect(result.txHashesToEvict.length).toBe(2);
      });

      it('rejects incoming tx if it cannot beat ALL conflicting txs', async () => {
        const existingTx1 = await mockPublicTx(1, 3);
        const existingTx2 = await mockPublicTx(2, 100); // Higher fee than incoming
        const incomingTx = await mockPublicTx(3, 10);

        setNullifier(incomingTx, 0, getNullifier(existingTx1, 0));
        setNullifier(incomingTx, 1, getNullifier(existingTx2, 0));

        const existingHash1 = existingTx1.getTxHash();
        const existingHash2 = existingTx2.getTxHash();

        poolAccess.getTxHashByNullifier.mockImplementation(nullifier => {
          if (nullifier.equals(getNullifier(existingTx1, 0))) {
            return Promise.resolve(existingHash1);
          }
          if (nullifier.equals(getNullifier(existingTx2, 0))) {
            return Promise.resolve(existingHash2);
          }
          return Promise.resolve(undefined);
        });
        poolAccess.getPendingTxByHash.mockImplementation(hash => {
          if (hash.equals(existingHash1)) {
            return Promise.resolve(existingTx1);
          }
          if (hash.equals(existingHash2)) {
            return Promise.resolve(existingTx2);
          }
          return Promise.resolve(undefined);
        });

        const result = await rule.check(incomingTx, poolAccess);

        expect(result.shouldReject).toBe(true);
        expect(result.txHashesToEvict.length).toBe(0); // Atomic: no partial evictions
      });
    });

    describe('same tx with multiple shared nullifiers', () => {
      it('handles two txs sharing multiple nullifiers', async () => {
        const existingTx = await mockPublicTx(1, 5);
        const incomingTx = await mockPublicTx(2, 10);

        // Share both nullifiers
        setNullifier(existingTx, 1, Fr.random());
        setNullifier(incomingTx, 0, getNullifier(existingTx, 0));
        setNullifier(incomingTx, 1, getNullifier(existingTx, 1));

        const existingHash = existingTx.getTxHash();

        // Both nullifiers map to the same existing tx
        poolAccess.getTxHashByNullifier.mockResolvedValue(existingHash);
        poolAccess.getPendingTxByHash.mockResolvedValue(existingTx);

        const result = await rule.check(incomingTx, poolAccess);

        expect(result.shouldReject).toBe(false);
        expect(result.txHashesToEvict.some(h => h.equals(existingHash))).toBe(true);
        expect(result.txHashesToEvict.length).toBe(1); // Only added once, not duplicated
      });

      it('does not double-count when same tx conflicts on multiple nullifiers', async () => {
        const existingTx = await mockPublicTx(1, 5);
        const incomingTx = await mockPublicTx(2, 10);

        // Share 3 nullifiers
        setNullifier(existingTx, 1, Fr.random());
        setNullifier(existingTx, 2, Fr.random());
        setNullifier(incomingTx, 0, getNullifier(existingTx, 0));
        setNullifier(incomingTx, 1, getNullifier(existingTx, 1));
        setNullifier(incomingTx, 2, getNullifier(existingTx, 2));

        const existingHash = existingTx.getTxHash();

        poolAccess.getTxHashByNullifier.mockResolvedValue(existingHash);
        poolAccess.getPendingTxByHash.mockResolvedValue(existingTx);

        const result = await rule.check(incomingTx, poolAccess);

        expect(result.shouldReject).toBe(false);
        expect(result.txHashesToEvict.length).toBe(1); // Existing tx only in array once
      });
    });

    describe('edge cases', () => {
      it('skips self-reference (incoming tx hash in conflict list)', async () => {
        const tx = await mockPublicTx(1, 5);
        const txHash = tx.getTxHash();

        // Simulate edge case where own hash appears in conflict list
        poolAccess.getTxHashByNullifier.mockResolvedValue(txHash);

        const result = await rule.check(tx, poolAccess);

        expect(result.shouldReject).toBe(false);
        expect(result.txHashesToEvict.length).toBe(0);
      });

      it('handles missing conflicting tx gracefully', async () => {
        const incomingTx = await mockPublicTx(1, 10);

        // Conflict exists in index but tx is not found
        poolAccess.getTxHashByNullifier.mockResolvedValue(TxHash.random());
        poolAccess.getPendingTxByHash.mockResolvedValue(undefined);

        const result = await rule.check(incomingTx, poolAccess);

        expect(result.shouldReject).toBe(false);
        expect(result.txHashesToEvict.length).toBe(0);
      });
    });
  });
});
