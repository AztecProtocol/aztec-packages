import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import type { MerkleTreeReadOperations } from '@aztec/stdlib/trees';
import { BlockHeader } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import type { TxMetaData } from '../tx_metadata.js';
import type { EvictionContext, PoolOperations } from './interfaces.js';
import { EvictionEvent } from './interfaces.js';
import { InvalidTxsAfterReorgRule } from './invalid_txs_after_reorg_rule.js';

describe('InvalidTxsAfterReorgRule', () => {
  let pool: PoolOperations;
  let worldState: MockProxy<WorldStateSynchronizer>;
  let db: MockProxy<MerkleTreeReadOperations>;
  let rule: InvalidTxsAfterReorgRule;

  let deleteTxsMock: jest.MockedFunction<any>;

  // Helper to create TxMetaData for testing
  const createMeta = (txHash: string, anchorBlockHeaderHash: string): TxMetaData => ({
    txHash,
    anchorBlockHeaderHash,
    priorityFee: 100n,
    feePayer: '0xfeepayer',
    claimAmount: 0n,
    feeLimit: 100n,
    nullifiers: [`0x${txHash.slice(2)}null1`],
    includeByTimestamp: 0n,
  });

  // Create mock pool operations
  const createPoolOps = (pendingTxs: TxMetaData[]): PoolOperations => {
    deleteTxsMock = jest.fn(() => Promise.resolve());
    return {
      getPendingTxs: () => pendingTxs,
      getPendingFeePayers: () => [...new Set(pendingTxs.map(t => t.feePayer))],
      getFeePayerPendingTxs: (feePayer: string) => pendingTxs.filter(t => t.feePayer === feePayer),
      getPendingTxCount: () => pendingTxs.length,
      getLowestPriorityPending: () => [],
      deleteTxs: deleteTxsMock as (txHashes: string[]) => Promise<void>,
    };
  };

  beforeEach(() => {
    pool = createPoolOps([]);

    db = mock<MerkleTreeReadOperations>();
    // Default mock implementation - no blocks exist in the tree
    db.findLeafIndices.mockImplementation((_, indices) => Promise.resolve((indices as Fr[]).map(_ => undefined)));

    worldState = mock<WorldStateSynchronizer>();
    worldState.getSnapshot.mockReturnValue(db);
    worldState.syncImmediate.mockResolvedValue(BlockNumber(1));

    rule = new InvalidTxsAfterReorgRule(worldState);
  });

  describe('evict method', () => {
    describe('non-CHAIN_PRUNED events', () => {
      it('returns empty result for TXS_ADDED event', async () => {
        const context: EvictionContext = {
          event: EvictionEvent.TXS_ADDED,
          newTxHashes: [],
          feePayers: [],
        };

        const result = await rule.evict(context, pool);

        expect(result).toEqual({
          reason: 'reorg_invalid_txs',
          success: true,
          txsEvicted: [],
        });
      });

      it('returns empty result for BLOCK_MINED event', async () => {
        const context: EvictionContext = {
          event: EvictionEvent.BLOCK_MINED,
          block: BlockHeader.empty(),
          newNullifiers: [],
          feePayers: [],
        };

        const result = await rule.evict(context, pool);

        expect(result).toEqual({
          reason: 'reorg_invalid_txs',
          success: true,
          txsEvicted: [],
        });
      });
    });

    describe('CHAIN_PRUNED events', () => {
      it('handles no pending transactions', async () => {
        const context: EvictionContext = {
          event: EvictionEvent.CHAIN_PRUNED,
          blockNumber: BlockNumber(1),
        };

        pool = createPoolOps([]);
        const result = await rule.evict(context, pool);

        expect(result).toEqual({
          reason: 'reorg_invalid_txs',
          success: true,
          txsEvicted: [],
        });

        expect(deleteTxsMock).not.toHaveBeenCalled();
      });

      it('evicts all transactions that reference pruned blocks', async () => {
        const context: EvictionContext = {
          event: EvictionEvent.CHAIN_PRUNED,
          blockNumber: BlockNumber(1),
        };

        const headerHash1 = Fr.random().toString();
        const headerHash2 = Fr.random().toString();
        const tx1 = createMeta('0x1111', headerHash1);
        const tx2 = createMeta('0x2222', headerHash2);

        pool = createPoolOps([tx1, tx2]);

        const result = await rule.evict(context, pool);

        expect(result.success).toBe(true);
        // Both txs reference pruned blocks (default mock returns undefined)
        expect(result.txsEvicted).toContain('0x1111');
        expect(result.txsEvicted).toContain('0x2222');
        // Ensure syncImmediate is called before accessing the world state snapshot
        expect(worldState.syncImmediate).toHaveBeenCalledWith(BlockNumber(1));
      });

      it('handles large number of transactions efficiently', async () => {
        const context: EvictionContext = {
          event: EvictionEvent.CHAIN_PRUNED,
          blockNumber: BlockNumber(1),
        };

        const pendingTxs: TxMetaData[] = [];

        // Create 1000 transactions
        for (let i = 0; i < 1000; i++) {
          const txHash = `0x${i.toString(16).padStart(4, '0')}`;
          const headerHash = Fr.random().toString();
          pendingTxs.push(createMeta(txHash, headerHash));
        }

        pool = createPoolOps(pendingTxs);

        const result = await rule.evict(context, pool);

        expect(result.success).toBe(true);
        expect(result.txsEvicted.length).toBe(pendingTxs.length);
        expect(deleteTxsMock).toHaveBeenCalledWith(result.txsEvicted);
      });

      it('handles error from deleteTxs operation', async () => {
        const context: EvictionContext = {
          event: EvictionEvent.CHAIN_PRUNED,
          blockNumber: BlockNumber(1),
        };

        const headerHash = Fr.random().toString();
        const tx1 = createMeta('0x1111', headerHash);

        pool = createPoolOps([tx1]);
        deleteTxsMock.mockRejectedValue(new Error('Test error'));

        const result = await rule.evict(context, pool);

        expect(result.success).toBe(false);
        expect(result.error?.cause).toEqual(new Error('Test error'));
      });
    });

    describe('edge cases', () => {
      it('deduplicates block hashes when multiple txs reference the same block', async () => {
        const context: EvictionContext = {
          event: EvictionEvent.CHAIN_PRUNED,
          blockNumber: BlockNumber(1),
        };

        const sharedBlockHash = Fr.random().toString();
        const tx1 = createMeta('0x1111', sharedBlockHash);
        const tx2 = createMeta('0x2222', sharedBlockHash);
        const tx3 = createMeta('0x3333', sharedBlockHash);

        pool = createPoolOps([tx1, tx2, tx3]);

        const result = await rule.evict(context, pool);

        expect(result.success).toBe(true);
        expect(result.txsEvicted).toHaveLength(3);
        expect(result.txsEvicted).toContain('0x1111');
        expect(result.txsEvicted).toContain('0x2222');
        expect(result.txsEvicted).toContain('0x3333');
        // Only one unique block hash to look up
        expect(db.findLeafIndices).toHaveBeenCalledTimes(1);
        const calledHashes = db.findLeafIndices.mock.calls[0][1] as Fr[];
        expect(calledHashes).toHaveLength(1);
      });

      it('only evicts txs referencing pruned blocks, keeps txs referencing valid blocks', async () => {
        const context: EvictionContext = {
          event: EvictionEvent.CHAIN_PRUNED,
          blockNumber: BlockNumber(1),
        };

        const validBlockHash = Fr.random();
        const prunedBlockHash = Fr.random();
        const tx1 = createMeta('0x1111', validBlockHash.toString());
        const tx2 = createMeta('0x2222', prunedBlockHash.toString());
        const tx3 = createMeta('0x3333', validBlockHash.toString());

        pool = createPoolOps([tx1, tx2, tx3]);

        db.findLeafIndices.mockImplementation((_, hashes) =>
          Promise.resolve((hashes as Fr[]).map(h => (h.equals(validBlockHash) ? 42n : undefined))),
        );

        const result = await rule.evict(context, pool);

        expect(result.success).toBe(true);
        expect(result.txsEvicted).toHaveLength(1);
        expect(result.txsEvicted).toContain('0x2222');
        expect(result.txsEvicted).not.toContain('0x1111');
        expect(result.txsEvicted).not.toContain('0x3333');
      });

      it('handles mix of shared and unique block hashes with some valid and some pruned', async () => {
        const context: EvictionContext = {
          event: EvictionEvent.CHAIN_PRUNED,
          blockNumber: BlockNumber(1),
        };

        const validSharedHash = Fr.random();
        const prunedSharedHash = Fr.random();
        const prunedUniqueHash = Fr.random();

        const tx1 = createMeta('0x1111', validSharedHash.toString());
        const tx2 = createMeta('0x2222', validSharedHash.toString());
        const tx3 = createMeta('0x3333', prunedSharedHash.toString());
        const tx4 = createMeta('0x4444', prunedSharedHash.toString());
        const tx5 = createMeta('0x5555', prunedUniqueHash.toString());

        pool = createPoolOps([tx1, tx2, tx3, tx4, tx5]);

        db.findLeafIndices.mockImplementation((_, hashes) =>
          Promise.resolve((hashes as Fr[]).map(h => (h.equals(validSharedHash) ? 10n : undefined))),
        );

        const result = await rule.evict(context, pool);

        expect(result.success).toBe(true);
        expect(result.txsEvicted).toHaveLength(3);
        expect(result.txsEvicted).toContain('0x3333');
        expect(result.txsEvicted).toContain('0x4444');
        expect(result.txsEvicted).toContain('0x5555');
        expect(result.txsEvicted).not.toContain('0x1111');
        expect(result.txsEvicted).not.toContain('0x2222');
        expect(db.findLeafIndices).toHaveBeenCalledTimes(1);
        const calledHashes = db.findLeafIndices.mock.calls[0][1] as Fr[];
        expect(calledHashes).toHaveLength(3);
      });
    });
  });
});
