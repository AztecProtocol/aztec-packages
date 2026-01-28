import { BlockNumber } from '@aztec/foundation/branded-types';
import { BlockHeader } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';

import type { TxMetaData } from '../tx_metadata.js';
import type { EvictionContext, PoolOperations } from './interfaces.js';
import { EvictionEvent } from './interfaces.js';
import { InvalidTxsAfterMiningRule } from './invalid_txs_after_mining_rule.js';

describe('InvalidTxsAfterMiningRule', () => {
  let pool: PoolOperations;
  let rule: InvalidTxsAfterMiningRule;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let deleteTxsMock: jest.MockedFunction<any>;

  // Default timestamp used in tests - must be > block timestamp (1000n) to avoid expiration
  const DEFAULT_INCLUDE_BY_TIMESTAMP = 2000n;

  // Helper to create TxMetaData for testing
  const createMeta = (
    txHash: string,
    opts: {
      nullifiers?: string[];
      includeByTimestamp?: bigint;
    } = {},
  ): TxMetaData => ({
    txHash,
    anchorBlockHeaderHash: '0x1234',
    priorityFee: 100n,
    feePayer: '0xfeepayer',
    claimAmount: 0n,
    feeLimit: 100n,
    nullifiers: opts.nullifiers ?? [`0x${txHash.slice(2)}null1`],
    includeByTimestamp: opts.includeByTimestamp ?? DEFAULT_INCLUDE_BY_TIMESTAMP,
  });

  // Create mock pool operations
  const createPoolOps = (pendingTxs: TxMetaData[]): PoolOperations => {
    deleteTxsMock = jest.fn(() => Promise.resolve());
    return {
      getPendingTxs: () => pendingTxs,
      getPendingFeePayers: () => [...new Set(pendingTxs.map(t => t.feePayer))],
      getFeePayerPendingTxs: (feePayer: string) => pendingTxs.filter(t => t.feePayer === feePayer),
      getPendingTxCount: () => pendingTxs.length,
      getLowestPriorityEvictable: () => [],
      deleteTxs: deleteTxsMock as (txHashes: string[]) => Promise<void>,
    };
  };

  beforeEach(() => {
    pool = createPoolOps([]);
    rule = new InvalidTxsAfterMiningRule();
  });

  describe('evict method', () => {
    describe('non-BLOCK_MINED events', () => {
      it('returns empty result for TXS_ADDED event', async () => {
        const context: EvictionContext = {
          event: EvictionEvent.TXS_ADDED,
          newTxHashes: [],
          feePayers: [],
        };

        const result = await rule.evict(context, pool);

        expect(result).toEqual({
          reason: 'block_mined_invalid_txs',
          success: true,
          txsEvicted: [],
        });
      });

      it('returns empty result for CHAIN_PRUNED event', async () => {
        const context: EvictionContext = {
          event: EvictionEvent.CHAIN_PRUNED,
          blockNumber: BlockNumber(1),
        };

        const result = await rule.evict(context, pool);

        expect(result).toEqual({
          reason: 'block_mined_invalid_txs',
          success: true,
          txsEvicted: [],
        });
      });
    });

    describe('BLOCK_MINED events', () => {
      let blockHeader: BlockHeader;
      let newNullifiers: string[];

      beforeEach(() => {
        blockHeader = BlockHeader.empty();
        blockHeader.globalVariables.blockNumber = BlockNumber(100);
        blockHeader.globalVariables.timestamp = 1000n;

        newNullifiers = ['0xnull1', '0xnull2'];
      });

      it('evicts transactions with duplicate nullifiers', async () => {
        const tx1 = createMeta('0x1111', { nullifiers: [newNullifiers[0]] }); // Has duplicate
        const tx2 = createMeta('0x2222', { nullifiers: ['0xunique'] }); // No duplicate

        pool = createPoolOps([tx1, tx2]);

        const context: EvictionContext = {
          event: EvictionEvent.BLOCK_MINED,
          block: blockHeader,
          newNullifiers,
          feePayers: [],
        };

        const result = await rule.evict(context, pool);

        expect(result.success).toBe(true);
        expect(result.txsEvicted).toEqual(['0x1111']); // Only tx1 has duplicate nullifier
        expect(deleteTxsMock).toHaveBeenCalledWith(['0x1111']);
      });

      it('evicts transactions with expired timestamps', async () => {
        const tx1 = createMeta('0x1111', { includeByTimestamp: 500n }); // Expired (500 <= 1000)
        const tx2 = createMeta('0x2222', { includeByTimestamp: 1500n }); // Not expired (1500 > 1000)

        pool = createPoolOps([tx1, tx2]);

        const context: EvictionContext = {
          event: EvictionEvent.BLOCK_MINED,
          block: blockHeader,
          newNullifiers: [],
          feePayers: [],
        };

        const result = await rule.evict(context, pool);

        expect(result.success).toBe(true);
        expect(result.txsEvicted).toEqual(['0x1111']); // Only tx1 is expired
        expect(deleteTxsMock).toHaveBeenCalledWith(['0x1111']);
      });

      it('evicts transactions with timestamp equal to block timestamp', async () => {
        const tx1 = createMeta('0x1111', { includeByTimestamp: 1000n }); // Exactly at timestamp
        const tx2 = createMeta('0x2222', { includeByTimestamp: 1001n }); // Just after

        pool = createPoolOps([tx1, tx2]);

        const context: EvictionContext = {
          event: EvictionEvent.BLOCK_MINED,
          block: blockHeader,
          newNullifiers: [],
          feePayers: [],
        };

        const result = await rule.evict(context, pool);

        expect(result.success).toBe(true);
        expect(result.txsEvicted).toEqual(['0x1111']); // tx1 has timestamp <= block timestamp
        expect(deleteTxsMock).toHaveBeenCalledWith(['0x1111']);
      });

      it('handles transactions with both duplicate nullifiers and expired timestamps', async () => {
        const tx1 = createMeta('0x1111', { nullifiers: [newNullifiers[0]], includeByTimestamp: 500n }); // Both reasons
        const tx2 = createMeta('0x2222', { nullifiers: ['0xunique'], includeByTimestamp: 1500n }); // Neither

        pool = createPoolOps([tx1, tx2]);

        const context: EvictionContext = {
          event: EvictionEvent.BLOCK_MINED,
          block: blockHeader,
          newNullifiers,
          feePayers: [],
        };

        const result = await rule.evict(context, pool);

        expect(result.success).toBe(true);
        expect(result.txsEvicted).toEqual(['0x1111']);
        expect(deleteTxsMock).toHaveBeenCalledWith(['0x1111']);
      });

      it('handles empty pending transactions list', async () => {
        pool = createPoolOps([]);

        const context: EvictionContext = {
          event: EvictionEvent.BLOCK_MINED,
          block: blockHeader,
          newNullifiers,
          feePayers: [],
        };

        const result = await rule.evict(context, pool);

        expect(result).toEqual({
          reason: 'block_mined_invalid_txs',
          success: true,
          txsEvicted: [],
        });
        expect(deleteTxsMock).not.toHaveBeenCalled();
      });

      it('handles transactions with multiple nullifiers where only one matches', async () => {
        const tx1 = createMeta('0x1111', { nullifiers: ['0xunique1', newNullifiers[0], '0xunique2'] }); // One match
        const tx2 = createMeta('0x2222', { nullifiers: ['0xunique3', '0xunique4'] }); // No match

        pool = createPoolOps([tx1, tx2]);

        const context: EvictionContext = {
          event: EvictionEvent.BLOCK_MINED,
          block: blockHeader,
          newNullifiers,
          feePayers: [],
        };

        const result = await rule.evict(context, pool);

        expect(result.success).toBe(true);
        expect(result.txsEvicted).toEqual(['0x1111']);
      });

      it('evicts all matching transactions when multiple share nullifiers with mined block', async () => {
        const tx1 = createMeta('0x1111', { nullifiers: [newNullifiers[0]] });
        const tx2 = createMeta('0x2222', { nullifiers: [newNullifiers[1]] });
        const tx3 = createMeta('0x3333', { nullifiers: ['0xunique'] });

        pool = createPoolOps([tx1, tx2, tx3]);

        const context: EvictionContext = {
          event: EvictionEvent.BLOCK_MINED,
          block: blockHeader,
          newNullifiers,
          feePayers: [],
        };

        const result = await rule.evict(context, pool);

        expect(result.success).toBe(true);
        expect(result.txsEvicted).toContain('0x1111');
        expect(result.txsEvicted).toContain('0x2222');
        expect(result.txsEvicted).not.toContain('0x3333');
      });

      it('handles error from deleteTxs operation', async () => {
        const tx1 = createMeta('0x1111', { nullifiers: [newNullifiers[0]] });
        pool = createPoolOps([tx1]);
        deleteTxsMock.mockRejectedValue(new Error('Test error'));

        const context: EvictionContext = {
          event: EvictionEvent.BLOCK_MINED,
          block: blockHeader,
          newNullifiers,
          feePayers: [],
        };

        const result = await rule.evict(context, pool);

        expect(result.success).toBe(false);
        expect(result.txsEvicted).toEqual([]);
        expect(result.error).toBeDefined();
      });
    });
  });
});
