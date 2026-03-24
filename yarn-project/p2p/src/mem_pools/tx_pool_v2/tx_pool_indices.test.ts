import { Fr } from '@aztec/foundation/curves/bn254';

import { stubTxMetaData, txHashFromBigInt } from './tx_metadata.js';
import { TxPoolIndices } from './tx_pool_indices.js';

describe('TxPoolIndices', () => {
  let indices: TxPoolIndices;

  const makeMeta = (seed: number, priorityFee: bigint) =>
    stubTxMetaData(new Fr(seed).toString(), { priorityFee, nullifiers: [`nullifier-${seed}`] });

  beforeEach(() => {
    indices = new TxPoolIndices();
  });

  describe('sorted pending order', () => {
    it('iterates descending by fee then hash', () => {
      const low = makeMeta(1, 10n);
      const mid = makeMeta(2, 50n);
      const high = makeMeta(3, 100n);

      indices.addPending(low);
      indices.addPending(high);
      indices.addPending(mid);

      const desc = [...indices.iteratePendingByPriority('desc')];
      expect(desc).toEqual([high.txHash, mid.txHash, low.txHash]);
    });

    it('iterates ascending by fee then hash', () => {
      const low = makeMeta(1, 10n);
      const mid = makeMeta(2, 50n);
      const high = makeMeta(3, 100n);

      indices.addPending(high);
      indices.addPending(low);
      indices.addPending(mid);

      const asc = [...indices.iteratePendingByPriority('asc')];
      expect(asc).toEqual([low.txHash, mid.txHash, high.txHash]);
    });

    it('uses txHash as tiebreaker for equal fees', () => {
      const a = makeMeta(10, 50n);
      const b = makeMeta(20, 50n);
      const c = makeMeta(30, 50n);

      indices.addPending(c);
      indices.addPending(a);
      indices.addPending(b);

      const asc = [...indices.iteratePendingByPriority('asc')];
      expect(asc).toHaveLength(3);

      const hashes = [a, b, c].map(m => m.txHashBigInt);
      hashes.sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
      const expectedAsc = hashes.map(h => txHashFromBigInt(h));
      expect(asc).toEqual(expectedAsc);
    });
  });

  describe('remove', () => {
    it('maintains order after removal', () => {
      const a = makeMeta(1, 10n);
      const b = makeMeta(2, 50n);
      const c = makeMeta(3, 100n);

      indices.addPending(a);
      indices.addPending(b);
      indices.addPending(c);

      indices.remove(b.txHash);

      const desc = [...indices.iteratePendingByPriority('desc')];
      expect(desc).toEqual([c.txHash, a.txHash]);
    });

    it('handles removing non-existent tx gracefully', () => {
      const a = makeMeta(1, 10n);
      indices.addPending(a);

      indices.remove('0xdeadbeef');
      expect(indices.getPendingTxCount()).toBe(1);
    });
  });

  describe('count', () => {
    it('returns correct count after adds and removes', () => {
      expect(indices.getPendingTxCount()).toBe(0);

      const a = makeMeta(1, 10n);
      const b = makeMeta(2, 20n);
      indices.addPending(a);
      indices.addPending(b);
      expect(indices.getPendingTxCount()).toBe(2);

      indices.remove(a.txHash);
      expect(indices.getPendingTxCount()).toBe(1);

      indices.remove(b.txHash);
      expect(indices.getPendingTxCount()).toBe(0);
    });
  });

  describe('getLowestPriorityPendingTx', () => {
    it('returns the lowest priority tx', () => {
      const low = makeMeta(1, 5n);
      const high = makeMeta(2, 100n);

      indices.addPending(high);
      indices.addPending(low);

      expect(indices.getLowestPriorityPendingTx()?.txHash).toBe(low.txHash);
    });

    it('returns undefined for empty pool', () => {
      expect(indices.getLowestPriorityPendingTx()).toBeUndefined();
    });
  });

  describe('filter', () => {
    it('applies filter during iteration', () => {
      const a = makeMeta(1, 10n);
      const b = makeMeta(2, 50n);
      const c = makeMeta(3, 100n);

      indices.addPending(a);
      indices.addPending(b);
      indices.addPending(c);

      const filtered = [...indices.iteratePendingByPriority('desc', hash => hash !== b.txHash)];
      expect(filtered).toEqual([c.txHash, a.txHash]);
    });
  });

  describe('eligible pending', () => {
    it('filters by receivedAt', () => {
      const old = makeMeta(1, 10n);
      old.receivedAt = 100;
      const recent = makeMeta(2, 50n);
      recent.receivedAt = 500;

      indices.addPending(old);
      indices.addPending(recent);

      const eligible = [...indices.iterateEligiblePendingByPriority('desc', 200)];
      expect(eligible).toEqual([old.txHash]);
    });
  });

  describe('edge cases', () => {
    it('iterates empty pool without error', () => {
      expect([...indices.iteratePendingByPriority('desc')]).toEqual([]);
      expect([...indices.iteratePendingByPriority('asc')]).toEqual([]);
    });

    it('handles single element', () => {
      const a = makeMeta(1, 10n);
      indices.addPending(a);

      expect([...indices.iteratePendingByPriority('desc')]).toEqual([a.txHash]);
      expect([...indices.iteratePendingByPriority('asc')]).toEqual([a.txHash]);
    });

    it('does not add duplicates', () => {
      const a = makeMeta(1, 10n);
      indices.addPending(a);
      indices.addPending(a);

      expect(indices.getPendingTxCount()).toBe(1);
    });

    it('add-remove-add cycle works', () => {
      const a = makeMeta(1, 10n);
      indices.addPending(a);
      indices.remove(a.txHash);
      expect(indices.getPendingTxCount()).toBe(0);

      indices.addPending(a);
      expect(indices.getPendingTxCount()).toBe(1);
      expect([...indices.iteratePendingByPriority('desc')]).toEqual([a.txHash]);
    });
  });
});
