import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { mockTx } from '@aztec/stdlib/testing';
import type { Tx } from '@aztec/stdlib/tx';

import { TxArchive } from './tx_archive.js';

describe('TxArchive', () => {
  /** Helper to verify a retrieved tx matches the original */
  const expectTxMatch = (retrieved: Tx | undefined, original: Tx) => {
    expect(retrieved).toBeDefined();
    expect(retrieved!.getTxHash().toString()).toBe(original.getTxHash().toString());
  };

  describe('isEnabled', () => {
    it('returns false when limit is 0', async () => {
      const store = await openTmpStore('archive');
      const archive = new TxArchive(store, 0);

      expect(archive.isEnabled()).toBe(false);
    });

    it('returns true when limit is greater than 0', async () => {
      const store = await openTmpStore('archive');
      const archive = new TxArchive(store, 10);

      expect(archive.isEnabled()).toBe(true);
    });
  });

  describe('updateLimit', () => {
    it('updates the limit', async () => {
      const store = await openTmpStore('archive');
      const archive = new TxArchive(store, 5);

      expect(archive.getLimit()).toBe(5);

      archive.updateLimit(10);

      expect(archive.getLimit()).toBe(10);
    });

    it('can disable archiving by setting limit to 0', async () => {
      const store = await openTmpStore('archive');
      const archive = new TxArchive(store, 5);

      expect(archive.isEnabled()).toBe(true);

      archive.updateLimit(0);

      expect(archive.isEnabled()).toBe(false);
    });
  });

  describe('archiveTxs', () => {
    it('does nothing when disabled', async () => {
      const store = await openTmpStore('archive');
      const archive = new TxArchive(store, 0);
      const tx = await mockTx(1);

      await archive.archiveTxs([tx]);

      expect(await archive.getCount()).toBe(0);
    });

    it('does nothing with empty array', async () => {
      const store = await openTmpStore('archive');
      const archive = new TxArchive(store, 10);

      await archive.archiveTxs([]);

      expect(await archive.getCount()).toBe(0);
    });

    it('archives a single transaction', async () => {
      const store = await openTmpStore('archive');
      const archive = new TxArchive(store, 10);
      const tx = await mockTx(1);

      await archive.archiveTxs([tx]);

      expect(await archive.getCount()).toBe(1);
      expectTxMatch(await archive.getTxByHash(tx.getTxHash()), tx);
    });

    it('archives multiple transactions', async () => {
      const store = await openTmpStore('archive');
      const archive = new TxArchive(store, 10);
      const tx1 = await mockTx(1);
      const tx2 = await mockTx(2);
      const tx3 = await mockTx(3);

      await archive.archiveTxs([tx1, tx2, tx3]);

      expect(await archive.getCount()).toBe(3);
      expectTxMatch(await archive.getTxByHash(tx1.getTxHash()), tx1);
      expectTxMatch(await archive.getTxByHash(tx2.getTxHash()), tx2);
      expectTxMatch(await archive.getTxByHash(tx3.getTxHash()), tx3);
    });

    it('archives transactions in multiple batches', async () => {
      const store = await openTmpStore('archive');
      const archive = new TxArchive(store, 10);
      const tx1 = await mockTx(1);
      const tx2 = await mockTx(2);

      await archive.archiveTxs([tx1]);
      await archive.archiveTxs([tx2]);

      expect(await archive.getCount()).toBe(2);
      expectTxMatch(await archive.getTxByHash(tx1.getTxHash()), tx1);
      expectTxMatch(await archive.getTxByHash(tx2.getTxHash()), tx2);
    });

    it('strips proofs from archived transactions', async () => {
      const store = await openTmpStore('archive');
      const archive = new TxArchive(store, 10);
      const tx = await mockTx(1);

      await archive.archiveTxs([tx]);

      const retrieved = await archive.getTxByHash(tx.getTxHash());
      expectTxMatch(retrieved, tx);
      expect(retrieved!.chonkProof.isEmpty()).toBe(true);
    });
  });

  describe('FIFO eviction', () => {
    it('evicts oldest transaction when limit is reached', async () => {
      const store = await openTmpStore('archive');
      const archive = new TxArchive(store, 2);
      const tx1 = await mockTx(1);
      const tx2 = await mockTx(2);
      const tx3 = await mockTx(3);

      await archive.archiveTxs([tx1]);
      await archive.archiveTxs([tx2]);
      expect(await archive.getCount()).toBe(2);

      // Adding tx3 should evict tx1
      await archive.archiveTxs([tx3]);

      expect(await archive.getCount()).toBe(2);
      expect(await archive.getTxByHash(tx1.getTxHash())).toBeUndefined();
      expectTxMatch(await archive.getTxByHash(tx2.getTxHash()), tx2);
      expectTxMatch(await archive.getTxByHash(tx3.getTxHash()), tx3);
    });

    it('evicts multiple transactions when adding batch exceeds limit', async () => {
      const store = await openTmpStore('archive');
      const archive = new TxArchive(store, 3);
      const tx1 = await mockTx(1);
      const tx2 = await mockTx(2);
      const tx3 = await mockTx(3);
      const tx4 = await mockTx(4);
      const tx5 = await mockTx(5);

      await archive.archiveTxs([tx1, tx2]);
      expect(await archive.getCount()).toBe(2);

      // Adding 3 more txs should evict tx1 and tx2
      await archive.archiveTxs([tx3, tx4, tx5]);

      expect(await archive.getCount()).toBe(3);
      expect(await archive.getTxByHash(tx1.getTxHash())).toBeUndefined();
      expect(await archive.getTxByHash(tx2.getTxHash())).toBeUndefined();
      expectTxMatch(await archive.getTxByHash(tx3.getTxHash()), tx3);
      expectTxMatch(await archive.getTxByHash(tx4.getTxHash()), tx4);
      expectTxMatch(await archive.getTxByHash(tx5.getTxHash()), tx5);
    });

    it('handles batch larger than limit', async () => {
      const store = await openTmpStore('archive');
      const archive = new TxArchive(store, 2);
      const tx1 = await mockTx(1);
      const tx2 = await mockTx(2);
      const tx3 = await mockTx(3);
      const tx4 = await mockTx(4);

      // Adding 4 txs with limit of 2 should only keep last 2
      await archive.archiveTxs([tx1, tx2, tx3, tx4]);

      expect(await archive.getCount()).toBe(2);
      expect(await archive.getTxByHash(tx1.getTxHash())).toBeUndefined();
      expect(await archive.getTxByHash(tx2.getTxHash())).toBeUndefined();
      expectTxMatch(await archive.getTxByHash(tx3.getTxHash()), tx3);
      expectTxMatch(await archive.getTxByHash(tx4.getTxHash()), tx4);
    });

    it('evicts in FIFO order across multiple batches', async () => {
      const store = await openTmpStore('archive');
      const archive = new TxArchive(store, 3);
      const tx1 = await mockTx(1);
      const tx2 = await mockTx(2);
      const tx3 = await mockTx(3);
      const tx4 = await mockTx(4);
      const tx5 = await mockTx(5);

      await archive.archiveTxs([tx1]);
      await archive.archiveTxs([tx2]);
      await archive.archiveTxs([tx3]);
      expect(await archive.getCount()).toBe(3);

      await archive.archiveTxs([tx4]);
      expect(await archive.getCount()).toBe(3);
      expect(await archive.getTxByHash(tx1.getTxHash())).toBeUndefined();

      await archive.archiveTxs([tx5]);
      expect(await archive.getCount()).toBe(3);
      expect(await archive.getTxByHash(tx2.getTxHash())).toBeUndefined();

      // Only tx3, tx4, tx5 should remain
      expectTxMatch(await archive.getTxByHash(tx3.getTxHash()), tx3);
      expectTxMatch(await archive.getTxByHash(tx4.getTxHash()), tx4);
      expectTxMatch(await archive.getTxByHash(tx5.getTxHash()), tx5);
    });
  });

  describe('getTxByHash', () => {
    it('returns undefined for non-existent transaction', async () => {
      const store = await openTmpStore('archive');
      const archive = new TxArchive(store, 10);
      const tx = await mockTx(1);

      const result = await archive.getTxByHash(tx.getTxHash());

      expect(result).toBeUndefined();
    });

    it('returns the archived transaction', async () => {
      const store = await openTmpStore('archive');
      const archive = new TxArchive(store, 10);
      const tx = await mockTx(1);

      await archive.archiveTxs([tx]);

      expectTxMatch(await archive.getTxByHash(tx.getTxHash()), tx);
    });

    it('returns undefined after transaction is evicted', async () => {
      const store = await openTmpStore('archive');
      const archive = new TxArchive(store, 1);
      const tx1 = await mockTx(1);
      const tx2 = await mockTx(2);

      await archive.archiveTxs([tx1]);
      await archive.archiveTxs([tx2]);

      expect(await archive.getTxByHash(tx1.getTxHash())).toBeUndefined();
      expectTxMatch(await archive.getTxByHash(tx2.getTxHash()), tx2);
    });
  });

  describe('getCount', () => {
    it('returns 0 for empty archive', async () => {
      const store = await openTmpStore('archive');
      const archive = new TxArchive(store, 10);

      expect(await archive.getCount()).toBe(0);
    });

    it('returns correct count after archiving', async () => {
      const store = await openTmpStore('archive');
      const archive = new TxArchive(store, 10);
      const tx1 = await mockTx(1);
      const tx2 = await mockTx(2);

      await archive.archiveTxs([tx1, tx2]);

      expect(await archive.getCount()).toBe(2);
    });

    it('returns correct count after eviction', async () => {
      const store = await openTmpStore('archive');
      const archive = new TxArchive(store, 2);
      const tx1 = await mockTx(1);
      const tx2 = await mockTx(2);
      const tx3 = await mockTx(3);

      await archive.archiveTxs([tx1, tx2, tx3]);

      expect(await archive.getCount()).toBe(2);
    });
  });

  describe('persistence', () => {
    it('persists archived transactions across instances', async () => {
      const store = await openTmpStore('archive');
      const tx1 = await mockTx(1);
      const tx2 = await mockTx(2);

      // Archive with first instance
      const archive1 = new TxArchive(store, 10);
      await archive1.archiveTxs([tx1, tx2]);

      // Create new instance with same store
      const archive2 = new TxArchive(store, 10);

      expect(await archive2.getCount()).toBe(2);
      expectTxMatch(await archive2.getTxByHash(tx1.getTxHash()), tx1);
      expectTxMatch(await archive2.getTxByHash(tx2.getTxHash()), tx2);
    });

    it('continues FIFO eviction after restart', async () => {
      const store = await openTmpStore('archive');
      const tx1 = await mockTx(1);
      const tx2 = await mockTx(2);
      const tx3 = await mockTx(3);

      // Archive with first instance
      const archive1 = new TxArchive(store, 2);
      await archive1.archiveTxs([tx1, tx2]);

      // Create new instance and add more
      const archive2 = new TxArchive(store, 2);
      await archive2.archiveTxs([tx3]);

      // tx1 should be evicted
      expect(await archive2.getCount()).toBe(2);
      expect(await archive2.getTxByHash(tx1.getTxHash())).toBeUndefined();
      expectTxMatch(await archive2.getTxByHash(tx2.getTxHash()), tx2);
      expectTxMatch(await archive2.getTxByHash(tx3.getTxHash()), tx3);
    });
  });
});
