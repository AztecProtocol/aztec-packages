import { BlockNumber } from '@aztec/foundation/branded-types';
import { createLogger } from '@aztec/foundation/log';
import type { AztecAsyncMap } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';

import { DeletedPool } from './deleted_pool.js';

describe('DeletedPool', () => {
  let pool: DeletedPool;
  let store: Awaited<ReturnType<typeof openTmpStore>>;
  let txsDB: AztecAsyncMap<string, Buffer>;

  beforeEach(async () => {
    store = await openTmpStore('deleted-pool-test');
    txsDB = store.openMap('txs');
    pool = new DeletedPool(store, txsDB, createLogger('test'));
    await pool.hydrateFromDatabase();
  });

  afterEach(async () => {
    await store.delete();
  });

  describe('markFromPrunedBlock', () => {
    it('marks transactions as from a pruned block', async () => {
      await pool.markFromPrunedBlock([
        { txHash: 'tx1', minedAtBlock: BlockNumber(5) },
        { txHash: 'tx2', minedAtBlock: BlockNumber(7) },
      ]);

      expect(pool.isFromPrunedBlock('tx1')).toBe(true);
      expect(pool.isFromPrunedBlock('tx2')).toBe(true);
      expect(pool.isFromPrunedBlock('tx3')).toBe(false);
    });

    it('records the block number in which tx was originally mined', async () => {
      await pool.markFromPrunedBlock([
        { txHash: 'tx1', minedAtBlock: BlockNumber(5) },
        { txHash: 'tx2', minedAtBlock: BlockNumber(10) },
      ]);

      expect(pool.getMinedAtBlock('tx1')).toBe(BlockNumber(5));
      expect(pool.getMinedAtBlock('tx2')).toBe(BlockNumber(10));
      expect(pool.getMinedAtBlock('tx3')).toBeUndefined();
    });

    it('handles empty array gracefully', async () => {
      await pool.markFromPrunedBlock([]);
      expect(pool.getCount()).toBe(0);
    });

    it('updates to higher mined block when tx is re-mined and pruned again', async () => {
      // First prune: tx was mined at block 10
      await pool.markFromPrunedBlock([{ txHash: 'tx1', minedAtBlock: BlockNumber(10) }]);
      expect(pool.getMinedAtBlock('tx1')).toBe(BlockNumber(10));

      // Second prune: tx was re-mined at block 15 then pruned again
      // Should update to block 15 (higher)
      await pool.markFromPrunedBlock([{ txHash: 'tx1', minedAtBlock: BlockNumber(15) }]);
      expect(pool.getMinedAtBlock('tx1')).toBe(BlockNumber(15));

      // Lower block should be ignored
      await pool.markFromPrunedBlock([{ txHash: 'tx1', minedAtBlock: BlockNumber(12) }]);
      expect(pool.getMinedAtBlock('tx1')).toBe(BlockNumber(15));
    });
  });

  describe('clearIfMinedHigher', () => {
    it('clears tracking when tx re-mines at a higher block', async () => {
      await pool.markFromPrunedBlock([{ txHash: 'tx1', minedAtBlock: BlockNumber(10) }]);
      expect(pool.isFromPrunedBlock('tx1')).toBe(true);

      await pool.clearIfMinedHigher('tx1', BlockNumber(12));

      expect(pool.isFromPrunedBlock('tx1')).toBe(false);
      expect(pool.getMinedAtBlock('tx1')).toBeUndefined();
      expect(pool.getCount()).toBe(0);
    });

    it('clears tracking when tx re-mines at the same block', async () => {
      await pool.markFromPrunedBlock([{ txHash: 'tx1', minedAtBlock: BlockNumber(10) }]);

      await pool.clearIfMinedHigher('tx1', BlockNumber(10));

      expect(pool.isFromPrunedBlock('tx1')).toBe(false);
      expect(pool.getMinedAtBlock('tx1')).toBeUndefined();
    });

    it('preserves tracking when tx re-mines at a lower block', async () => {
      await pool.markFromPrunedBlock([{ txHash: 'tx1', minedAtBlock: BlockNumber(10) }]);

      await pool.clearIfMinedHigher('tx1', BlockNumber(8));

      expect(pool.isFromPrunedBlock('tx1')).toBe(true);
      expect(pool.getMinedAtBlock('tx1')).toBe(BlockNumber(10));
    });

    it('is a no-op for untracked transactions', async () => {
      await pool.clearIfMinedHigher('tx1', BlockNumber(10));

      expect(pool.isFromPrunedBlock('tx1')).toBe(false);
      expect(pool.getCount()).toBe(0);
    });

    it('persists clearing across restarts', async () => {
      await pool.markFromPrunedBlock([
        { txHash: 'tx1', minedAtBlock: BlockNumber(10) },
        { txHash: 'tx2', minedAtBlock: BlockNumber(10) },
      ]);

      // Clear tx1 (re-mined higher), keep tx2
      await pool.clearIfMinedHigher('tx1', BlockNumber(12));

      const pool2 = new DeletedPool(store, txsDB, createLogger('test2'));
      await pool2.hydrateFromDatabase();

      expect(pool2.isFromPrunedBlock('tx1')).toBe(false);
      expect(pool2.isFromPrunedBlock('tx2')).toBe(true);
    });
  });

  describe('deleteTx', () => {
    it('soft-deletes tx from pruned block (keeps in DB)', async () => {
      await txsDB.set('tx1', Buffer.from('data1'));
      await pool.markFromPrunedBlock([{ txHash: 'tx1', minedAtBlock: BlockNumber(5) }]);
      expect(pool.isSoftDeleted('tx1')).toBe(false);

      const result = await pool.deleteTx('tx1');

      expect(result).toBe('soft');
      expect(pool.isSoftDeleted('tx1')).toBe(true);
      expect(await txsDB.getAsync('tx1')).toBeDefined(); // Still in DB
    });

    it('hard-deletes tx NOT from pruned block (removes from DB)', async () => {
      await txsDB.set('tx1', Buffer.from('data1'));
      // tx1 is NOT marked as from pruned block

      const result = await pool.deleteTx('tx1');

      expect(result).toBe('hard');
      expect(pool.isSoftDeleted('tx1')).toBe(false);
      expect(await txsDB.getAsync('tx1')).toBeUndefined(); // Removed from DB
    });
  });

  describe('finalizeBlock', () => {
    it('hard-deletes only soft-deleted txs mined at or before the finalized block', async () => {
      // Add txs to the database
      await txsDB.set('tx1', Buffer.from('data1'));
      await txsDB.set('tx2', Buffer.from('data2'));
      await txsDB.set('tx3', Buffer.from('data3'));

      // Mark as from pruned blocks - each was mined at a different block
      await pool.markFromPrunedBlock([
        { txHash: 'tx1', minedAtBlock: BlockNumber(5) },
        { txHash: 'tx2', minedAtBlock: BlockNumber(10) },
        { txHash: 'tx3', minedAtBlock: BlockNumber(15) },
      ]);

      // Soft-delete tx1 and tx2 via deleteTx (tx3 is still in indices)
      await pool.deleteTx('tx1');
      await pool.deleteTx('tx2');

      // Finalize block 10
      const hardDeleted = await pool.finalizeBlock(BlockNumber(10));

      // Only tx1 and tx2 should be hard-deleted (soft-deleted and mined <= 10)
      expect(hardDeleted).toContain('tx1');
      expect(hardDeleted).toContain('tx2');
      expect(hardDeleted).not.toContain('tx3'); // Not soft-deleted

      // Verify removed from DB
      expect(await txsDB.getAsync('tx1')).toBeUndefined();
      expect(await txsDB.getAsync('tx2')).toBeUndefined();
      expect(await txsDB.getAsync('tx3')).toBeDefined(); // Still in DB

      // Verify removed from tracking
      expect(pool.isFromPrunedBlock('tx1')).toBe(false);
      expect(pool.isFromPrunedBlock('tx2')).toBe(false);
      expect(pool.isFromPrunedBlock('tx3')).toBe(true); // Still tracked
    });

    it('does not hard-delete txs that are from pruned block but not soft-deleted', async () => {
      await txsDB.set('tx1', Buffer.from('data1'));
      await pool.markFromPrunedBlock([{ txHash: 'tx1', minedAtBlock: BlockNumber(5) }]);
      // tx1 is NOT deleted via deleteTx (still in indices)

      const hardDeleted = await pool.finalizeBlock(BlockNumber(10));

      expect(hardDeleted).toHaveLength(0);
      expect(await txsDB.getAsync('tx1')).toBeDefined();
      expect(pool.isFromPrunedBlock('tx1')).toBe(true);
    });

    it('hard-deletes tx only after it is soft-deleted and its mined block is finalized', async () => {
      await txsDB.set('tx1', Buffer.from('data1'));

      // 1. Tx was mined in block 10, then chain pruned
      await pool.markFromPrunedBlock([{ txHash: 'tx1', minedAtBlock: BlockNumber(10) }]);
      expect(pool.isFromPrunedBlock('tx1')).toBe(true);
      expect(pool.isSoftDeleted('tx1')).toBe(false);

      // 2. Finalize block 5 - tx should NOT be deleted (mined at block 10)
      const hardDeleted1 = await pool.finalizeBlock(BlockNumber(5));
      expect(hardDeleted1).toHaveLength(0);
      expect(await txsDB.getAsync('tx1')).toBeDefined();
      expect(pool.isFromPrunedBlock('tx1')).toBe(true);

      // 3. Soft-delete the tx (e.g., due to eviction)
      const result = await pool.deleteTx('tx1');
      expect(result).toBe('soft');
      expect(pool.isSoftDeleted('tx1')).toBe(true);
      expect(await txsDB.getAsync('tx1')).toBeDefined(); // Still in DB

      // 4. Finalize block 9 - tx should NOT be deleted (mined at block 10)
      const hardDeleted2 = await pool.finalizeBlock(BlockNumber(9));
      expect(hardDeleted2).toHaveLength(0);
      expect(await txsDB.getAsync('tx1')).toBeDefined();

      // 5. Finalize block 10 - tx should now be hard-deleted
      const hardDeleted3 = await pool.finalizeBlock(BlockNumber(10));
      expect(hardDeleted3).toContain('tx1');
      expect(await txsDB.getAsync('tx1')).toBeUndefined(); // Gone from DB
      expect(pool.isFromPrunedBlock('tx1')).toBe(false);
      expect(pool.isSoftDeleted('tx1')).toBe(false);
    });

    it('tx re-mined at higher block is kept until that block is finalized', async () => {
      await txsDB.set('tx1', Buffer.from('data1'));

      // 1. Tx mined at block 4, then pruned
      await pool.markFromPrunedBlock([{ txHash: 'tx1', minedAtBlock: BlockNumber(4) }]);
      expect(pool.getMinedAtBlock('tx1')).toBe(BlockNumber(4));

      // 2. Tx re-mined at block 5, then pruned again
      await pool.markFromPrunedBlock([{ txHash: 'tx1', minedAtBlock: BlockNumber(5) }]);
      expect(pool.getMinedAtBlock('tx1')).toBe(BlockNumber(5));

      // 3. Tx is soft-deleted (e.g., failed validation after second prune)
      await pool.deleteTx('tx1');
      expect(pool.isSoftDeleted('tx1')).toBe(true);

      // 4. Block 4 finalized - tx should NOT be hard-deleted (mined at 5 > finalized 4)
      const deleted4 = await pool.finalizeBlock(BlockNumber(4));
      expect(deleted4).toHaveLength(0);
      expect(await txsDB.getAsync('tx1')).toBeDefined();

      // 5. Block 5 finalized - tx should be hard-deleted (mined at 5 <= finalized 5)
      const deleted5 = await pool.finalizeBlock(BlockNumber(5));
      expect(deleted5).toContain('tx1');
      expect(await txsDB.getAsync('tx1')).toBeUndefined();
    });

    it('multiple txs with different mined blocks finalize at correct times', async () => {
      // Setup: 3 txs mined at different blocks, all pruned
      await txsDB.set('tx5', Buffer.from('data5'));
      await txsDB.set('tx10', Buffer.from('data10'));
      await txsDB.set('tx15', Buffer.from('data15'));

      await pool.markFromPrunedBlock([
        { txHash: 'tx5', minedAtBlock: BlockNumber(5) },
        { txHash: 'tx10', minedAtBlock: BlockNumber(10) },
        { txHash: 'tx15', minedAtBlock: BlockNumber(15) },
      ]);

      // Soft-delete all of them
      await pool.deleteTx('tx5');
      await pool.deleteTx('tx10');
      await pool.deleteTx('tx15');

      // Finalize block 5 - only tx5 should be hard-deleted
      const deleted5 = await pool.finalizeBlock(BlockNumber(5));
      expect(deleted5).toEqual(['tx5']);
      expect(await txsDB.getAsync('tx5')).toBeUndefined();
      expect(await txsDB.getAsync('tx10')).toBeDefined();
      expect(await txsDB.getAsync('tx15')).toBeDefined();

      // Finalize block 10 - only tx10 should be hard-deleted
      const deleted10 = await pool.finalizeBlock(BlockNumber(10));
      expect(deleted10).toEqual(['tx10']);
      expect(await txsDB.getAsync('tx10')).toBeUndefined();
      expect(await txsDB.getAsync('tx15')).toBeDefined();

      // Finalize block 15 - tx15 should be hard-deleted
      const deleted15 = await pool.finalizeBlock(BlockNumber(15));
      expect(deleted15).toEqual(['tx15']);
      expect(await txsDB.getAsync('tx15')).toBeUndefined();
    });

    it('returns empty array when no transactions qualify', async () => {
      await txsDB.set('tx1', Buffer.from('data1'));
      await pool.markFromPrunedBlock([{ txHash: 'tx1', minedAtBlock: BlockNumber(10) }]);
      await pool.deleteTx('tx1'); // Soft-delete

      const hardDeleted = await pool.finalizeBlock(BlockNumber(5));

      expect(hardDeleted).toHaveLength(0);
      expect(await txsDB.getAsync('tx1')).toBeDefined();
      expect(pool.isSoftDeleted('tx1')).toBe(true);
    });
  });

  describe('persistence', () => {
    it('persists pruned block state across restarts', async () => {
      await pool.markFromPrunedBlock([
        { txHash: 'tx1', minedAtBlock: BlockNumber(5) },
        { txHash: 'tx2', minedAtBlock: BlockNumber(10) },
      ]);

      // Create a new pool instance with the same store
      const pool2 = new DeletedPool(store, txsDB, createLogger('test2'));
      await pool2.hydrateFromDatabase();

      expect(pool2.isFromPrunedBlock('tx1')).toBe(true);
      expect(pool2.isFromPrunedBlock('tx2')).toBe(true);
      expect(pool2.getMinedAtBlock('tx1')).toBe(BlockNumber(5));
      expect(pool2.getMinedAtBlock('tx2')).toBe(BlockNumber(10));
    });

    it('persists finalized entries', async () => {
      await txsDB.set('tx1', Buffer.from('data1'));
      await txsDB.set('tx2', Buffer.from('data2'));

      await pool.markFromPrunedBlock([
        { txHash: 'tx1', minedAtBlock: BlockNumber(5) },
        { txHash: 'tx2', minedAtBlock: BlockNumber(5) },
      ]);
      await pool.deleteTx('tx1');
      await pool.deleteTx('tx2');
      await pool.finalizeBlock(BlockNumber(5));

      // Create a new pool instance with the same store
      const pool2 = new DeletedPool(store, txsDB, createLogger('test2'));
      await pool2.hydrateFromDatabase();

      expect(pool2.isFromPrunedBlock('tx1')).toBe(false);
      expect(pool2.isFromPrunedBlock('tx2')).toBe(false);
    });

    it('persists soft-deleted state across restarts', async () => {
      await txsDB.set('tx1', Buffer.from('data1'));
      await txsDB.set('tx2', Buffer.from('data2'));

      // Mark as from pruned block and soft-delete
      await pool.markFromPrunedBlock([
        { txHash: 'tx1', minedAtBlock: BlockNumber(5) },
        { txHash: 'tx2', minedAtBlock: BlockNumber(5) },
      ]);
      await pool.deleteTx('tx1');
      // tx2 is NOT soft-deleted

      expect(pool.isSoftDeleted('tx1')).toBe(true);
      expect(pool.isSoftDeleted('tx2')).toBe(false);

      // Create a new pool instance with the same store (simulates restart)
      const pool2 = new DeletedPool(store, txsDB, createLogger('test2'));
      await pool2.hydrateFromDatabase();

      // Soft-deleted state should be preserved
      expect(pool2.isSoftDeleted('tx1')).toBe(true);
      expect(pool2.isSoftDeleted('tx2')).toBe(false);

      // Finalization should work correctly after restart
      const hardDeleted = await pool2.finalizeBlock(BlockNumber(5));
      expect(hardDeleted).toContain('tx1');
      expect(hardDeleted).not.toContain('tx2'); // Not soft-deleted

      // tx1 should be hard-deleted, tx2 still in DB
      expect(await txsDB.getAsync('tx1')).toBeUndefined();
      expect(await txsDB.getAsync('tx2')).toBeDefined();
    });
  });

  describe('getCount and getPrunedTxHashes', () => {
    it('returns correct count', async () => {
      expect(pool.getCount()).toBe(0);

      await pool.markFromPrunedBlock([
        { txHash: 'tx1', minedAtBlock: BlockNumber(5) },
        { txHash: 'tx2', minedAtBlock: BlockNumber(5) },
      ]);
      expect(pool.getCount()).toBe(2);

      await pool.markFromPrunedBlock([{ txHash: 'tx3', minedAtBlock: BlockNumber(10) }]);
      expect(pool.getCount()).toBe(3);
    });

    it('returns all pruned tx hashes', async () => {
      await pool.markFromPrunedBlock([
        { txHash: 'tx1', minedAtBlock: BlockNumber(5) },
        { txHash: 'tx2', minedAtBlock: BlockNumber(5) },
      ]);
      await pool.markFromPrunedBlock([{ txHash: 'tx3', minedAtBlock: BlockNumber(10) }]);

      const hashes = pool.getPrunedTxHashes();

      expect(hashes).toHaveLength(3);
      expect(hashes).toContain('tx1');
      expect(hashes).toContain('tx2');
      expect(hashes).toContain('tx3');
    });
  });
});
