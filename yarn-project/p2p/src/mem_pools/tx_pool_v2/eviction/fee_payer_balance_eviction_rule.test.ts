import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { MerkleTreeReadOperations, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { MerkleTreeId, PublicDataTreeLeaf, PublicDataTreeLeafPreimage } from '@aztec/stdlib/trees';
import { BlockHeader, GlobalVariables } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { type TxMetaData, stubTxMetaValidationData } from '../tx_metadata.js';
import { FeePayerBalanceEvictionRule } from './fee_payer_balance_eviction_rule.js';
import type { EvictionContext, PoolOperations } from './interfaces.js';
import { EvictionEvent } from './interfaces.js';

describe('FeePayerBalanceEvictionRule', () => {
  let rule: FeePayerBalanceEvictionRule;
  let mockWorldState: MockProxy<WorldStateSynchronizer>;
  let db: MockProxy<MerkleTreeReadOperations>;
  let deleteTxsMock: jest.MockedFunction<PoolOperations['deleteTxs']>;

  // Configurable balance per fee payer
  let feePayerBalances: Map<string, bigint>;

  const feePayer1 = '0x1111111111111111111111111111111111111111111111111111111111111111';
  const feePayer2 = '0x2222222222222222222222222222222222222222222222222222222222222222';

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
    feePayer: opts.feePayer ?? feePayer1,
    claimAmount: opts.claimAmount ?? 0n,
    feeLimit: opts.feeLimit ?? 100n,
    nullifiers: [`0x${txHash.slice(2)}null1`],
    includeByTimestamp: 0n,
    receivedAt: 0,
    data: stubTxMetaValidationData(),
  });

  // Create mock pool operations
  const createPoolOps = (txsByFeePayer: Map<string, TxMetaData[]>): PoolOperations => {
    deleteTxsMock = jest.fn(() => Promise.resolve());
    return {
      getPendingTxs: () => [...txsByFeePayer.values()].flat(),
      getPendingFeePayers: () => [...txsByFeePayer.keys()],
      getFeePayerPendingTxs: (feePayer: string) => txsByFeePayer.get(feePayer) ?? [],
      getPendingTxCount: () => [...txsByFeePayer.values()].flat().length,
      getLowestPriorityPending: () => [],
      deleteTxs: deleteTxsMock as (txHashes: string[]) => Promise<void>,
    };
  };

  // Setup mock world state to return configured balances
  const setupBalances = (balances: Map<string, bigint>) => {
    feePayerBalances = balances;

    // Mock the storage read to return the configured balance
    db.getPreviousValueIndex.mockImplementation((_tree, slot) => {
      return Promise.resolve({ index: slot, alreadyPresent: true });
    });

    db.getLeafPreimage.mockImplementation((tree, index) => {
      if (tree === MerkleTreeId.PUBLIC_DATA_TREE) {
        // Find the fee payer by matching the storage slot index
        // For simplicity, we use a default balance if not found
        const balance = feePayerBalances.get(feePayer1) ?? 0n;
        return Promise.resolve(
          new PublicDataTreeLeafPreimage(new PublicDataTreeLeaf(new Fr(index), new Fr(balance)), Fr.ONE, 1n),
        );
      }
      return Promise.resolve(undefined);
    });
  };

  beforeEach(() => {
    mockWorldState = mock<WorldStateSynchronizer>();
    db = mock<MerkleTreeReadOperations>();
    mockWorldState.getCommitted.mockReturnValue(db);
    mockWorldState.getSnapshot.mockReturnValue(db);
    mockWorldState.syncImmediate.mockResolvedValue(BlockNumber(1));

    feePayerBalances = new Map();
    setupBalances(feePayerBalances);

    rule = new FeePayerBalanceEvictionRule(mockWorldState);
  });

  describe('constructor', () => {
    it('has correct name and reason', () => {
      expect(rule.name).toBe('FeePayerBalanceEviction');
      expect(rule.reason).toBe('fee_payer_balance');
    });
  });

  describe('evict method', () => {
    describe('TXS_ADDED events', () => {
      it('returns empty result when all txs fit within balance', async () => {
        const meta1 = createMeta('0x1111', { feeLimit: 100n });
        const meta2 = createMeta('0x2222', { feeLimit: 100n });
        const txsByFeePayer = new Map([[feePayer1, [meta1, meta2]]]);
        const pool = createPoolOps(txsByFeePayer);

        // Balance covers both txs
        setupBalances(new Map([[feePayer1, 200n]]));

        const context: EvictionContext = {
          event: EvictionEvent.TXS_ADDED,
          newTxHashes: ['0x1111', '0x2222'],
          feePayers: [feePayer1],
        };

        const result = await rule.evict(context, pool);

        expect(result.success).toBe(true);
        expect(result.txsEvicted).toHaveLength(0);
        expect(deleteTxsMock).not.toHaveBeenCalled();
      });

      it('evicts low-priority tx when balance is insufficient', async () => {
        const lowPriorityMeta = createMeta('0x1111', { feeLimit: 100n, priorityFee: 10n });
        const highPriorityMeta = createMeta('0x2222', { feeLimit: 100n, priorityFee: 100n });
        const txsByFeePayer = new Map([[feePayer1, [lowPriorityMeta, highPriorityMeta]]]);
        const pool = createPoolOps(txsByFeePayer);

        // Balance only covers one tx
        setupBalances(new Map([[feePayer1, 100n]]));

        const context: EvictionContext = {
          event: EvictionEvent.TXS_ADDED,
          newTxHashes: ['0x1111', '0x2222'],
          feePayers: [feePayer1],
        };

        const result = await rule.evict(context, pool);

        expect(result.success).toBe(true);
        expect(result.txsEvicted).toEqual(['0x1111']); // Low priority evicted
        expect(deleteTxsMock).toHaveBeenCalledWith(['0x1111']);
      });

      it('evicts multiple low-priority txs when balance is insufficient', async () => {
        const lowMeta = createMeta('0x1111', { feeLimit: 100n, priorityFee: 10n });
        const medMeta = createMeta('0x2222', { feeLimit: 100n, priorityFee: 50n });
        const highMeta = createMeta('0x3333', { feeLimit: 100n, priorityFee: 100n });
        const txsByFeePayer = new Map([[feePayer1, [lowMeta, medMeta, highMeta]]]);
        const pool = createPoolOps(txsByFeePayer);

        // Balance only covers one tx
        setupBalances(new Map([[feePayer1, 100n]]));

        const context: EvictionContext = {
          event: EvictionEvent.TXS_ADDED,
          newTxHashes: ['0x1111', '0x2222', '0x3333'],
          feePayers: [feePayer1],
        };

        const result = await rule.evict(context, pool);

        expect(result.success).toBe(true);
        // Both low and medium priority should be evicted
        expect(result.txsEvicted).toContain('0x1111');
        expect(result.txsEvicted).toContain('0x2222');
        expect(result.txsEvicted).not.toContain('0x3333');
      });

      it('priority ordering is correct - highest priority gets funded first', async () => {
        // Create txs with clear priority ordering
        const tx10 = createMeta('0xaaaa', { feeLimit: 100n, priorityFee: 10n });
        const tx50 = createMeta('0xbbbb', { feeLimit: 100n, priorityFee: 50n });
        const tx100 = createMeta('0xcccc', { feeLimit: 100n, priorityFee: 100n });
        const txsByFeePayer = new Map([[feePayer1, [tx10, tx50, tx100]]]);
        const pool = createPoolOps(txsByFeePayer);

        // Balance covers 2 txs (200) - should keep tx100 and tx50, evict tx10
        setupBalances(new Map([[feePayer1, 200n]]));

        const context: EvictionContext = {
          event: EvictionEvent.TXS_ADDED,
          newTxHashes: ['0xaaaa', '0xbbbb', '0xcccc'],
          feePayers: [feePayer1],
        };

        const result = await rule.evict(context, pool);

        expect(result.success).toBe(true);
        expect(result.txsEvicted).toEqual(['0xaaaa']); // Only lowest priority evicted
        expect(deleteTxsMock).toHaveBeenCalledWith(['0xaaaa']);
      });

      it('considers claim amount when calculating available balance', async () => {
        // High priority tx claims funds that can be used by subsequent txs
        const highWithClaim = createMeta('0x1111', {
          feeLimit: 100n,
          priorityFee: 100n,
          claimAmount: 200n, // Claims 200, pays 100, net +100
        });
        const lowMeta = createMeta('0x2222', { feeLimit: 100n, priorityFee: 10n });
        const txsByFeePayer = new Map([[feePayer1, [highWithClaim, lowMeta]]]);
        const pool = createPoolOps(txsByFeePayer);

        // Initial balance is 100, but claim adds 200
        // After high: balance = 100 + 200 - 100 = 200
        // After low: balance = 200 - 100 = 100
        setupBalances(new Map([[feePayer1, 100n]]));

        const context: EvictionContext = {
          event: EvictionEvent.TXS_ADDED,
          newTxHashes: ['0x1111', '0x2222'],
          feePayers: [feePayer1],
        };

        const result = await rule.evict(context, pool);

        expect(result.success).toBe(true);
        expect(result.txsEvicted).toHaveLength(0); // Both can be funded due to claim
      });

      it('evicts when claim amount is not enough', async () => {
        const highWithClaim = createMeta('0x1111', {
          feeLimit: 100n,
          priorityFee: 100n,
          claimAmount: 50n, // Claims 50, pays 100, net -50
        });
        const lowMeta = createMeta('0x2222', { feeLimit: 100n, priorityFee: 10n });
        const txsByFeePayer = new Map([[feePayer1, [highWithClaim, lowMeta]]]);
        const pool = createPoolOps(txsByFeePayer);

        // Initial balance is 100
        // After high: balance = 100 + 50 - 100 = 50
        // Low needs 100, only 50 available
        setupBalances(new Map([[feePayer1, 100n]]));

        const context: EvictionContext = {
          event: EvictionEvent.TXS_ADDED,
          newTxHashes: ['0x1111', '0x2222'],
          feePayers: [feePayer1],
        };

        const result = await rule.evict(context, pool);

        expect(result.success).toBe(true);
        expect(result.txsEvicted).toEqual(['0x2222']); // Low priority evicted
      });

      it('handles zero balance', async () => {
        const meta = createMeta('0x1111', { feeLimit: 100n });
        const txsByFeePayer = new Map([[feePayer1, [meta]]]);
        const pool = createPoolOps(txsByFeePayer);

        setupBalances(new Map([[feePayer1, 0n]]));

        const context: EvictionContext = {
          event: EvictionEvent.TXS_ADDED,
          newTxHashes: ['0x1111'],
          feePayers: [feePayer1],
        };

        const result = await rule.evict(context, pool);

        expect(result.success).toBe(true);
        expect(result.txsEvicted).toEqual(['0x1111']);
      });

      it('handles empty fee payers list', async () => {
        const pool = createPoolOps(new Map());

        const context: EvictionContext = {
          event: EvictionEvent.TXS_ADDED,
          newTxHashes: [],
          feePayers: [],
        };

        const result = await rule.evict(context, pool);

        expect(result.success).toBe(true);
        expect(result.txsEvicted).toHaveLength(0);
      });

      it('handles fee payer with no pending txs', async () => {
        const pool = createPoolOps(new Map());

        const context: EvictionContext = {
          event: EvictionEvent.TXS_ADDED,
          newTxHashes: [],
          feePayers: [feePayer1], // Fee payer with no txs
        };

        const result = await rule.evict(context, pool);

        expect(result.success).toBe(true);
        expect(result.txsEvicted).toHaveLength(0);
      });
    });

    describe('BLOCK_MINED events', () => {
      const blockHeader = BlockHeader.empty({
        globalVariables: GlobalVariables.empty({
          blockNumber: BlockNumber(5),
        }),
      });

      it('syncs world state before checking balances', async () => {
        const meta = createMeta('0x1111', { feeLimit: 100n });
        const txsByFeePayer = new Map([[feePayer1, [meta]]]);
        const pool = createPoolOps(txsByFeePayer);
        setupBalances(new Map([[feePayer1, 100n]]));

        const context: EvictionContext = {
          event: EvictionEvent.BLOCK_MINED,
          block: blockHeader,
          newNullifiers: [],
          feePayers: [feePayer1],
        };

        await rule.evict(context, pool);

        expect(mockWorldState.syncImmediate).toHaveBeenCalledWith(5);
        expect(mockWorldState.getSnapshot).toHaveBeenCalledWith(5);
      });

      it('evicts low-priority tx when balance is insufficient after block', async () => {
        const lowMeta = createMeta('0x1111', { feeLimit: 100n, priorityFee: 10n });
        const highMeta = createMeta('0x2222', { feeLimit: 100n, priorityFee: 100n });
        const txsByFeePayer = new Map([[feePayer1, [lowMeta, highMeta]]]);
        const pool = createPoolOps(txsByFeePayer);

        // Balance only covers one tx
        setupBalances(new Map([[feePayer1, 100n]]));

        const context: EvictionContext = {
          event: EvictionEvent.BLOCK_MINED,
          block: blockHeader,
          newNullifiers: [],
          feePayers: [feePayer1],
        };

        const result = await rule.evict(context, pool);

        expect(result.success).toBe(true);
        expect(result.txsEvicted).toEqual(['0x1111']);
      });
    });

    describe('CHAIN_PRUNED events', () => {
      it('checks all pending fee payers after prune', async () => {
        const meta1 = createMeta('0x1111', { feeLimit: 100n, feePayer: feePayer1 });
        const meta2 = createMeta('0x2222', { feeLimit: 100n, feePayer: feePayer2 });
        const txsByFeePayer = new Map([
          [feePayer1, [meta1]],
          [feePayer2, [meta2]],
        ]);
        const pool = createPoolOps(txsByFeePayer);

        // Both fee payers have sufficient balance
        setupBalances(
          new Map([
            [feePayer1, 100n],
            [feePayer2, 100n],
          ]),
        );

        const context: EvictionContext = {
          event: EvictionEvent.CHAIN_PRUNED,
          blockNumber: BlockNumber(3),
        };

        await rule.evict(context, pool);

        expect(mockWorldState.syncImmediate).toHaveBeenCalledWith(BlockNumber(3));
        expect(mockWorldState.getSnapshot).toHaveBeenCalledWith(BlockNumber(3));
      });

      it('evicts txs when balance changed after prune', async () => {
        const meta = createMeta('0x1111', { feeLimit: 100n });
        const txsByFeePayer = new Map([[feePayer1, [meta]]]);
        const pool = createPoolOps(txsByFeePayer);

        // Balance insufficient after prune
        setupBalances(new Map([[feePayer1, 50n]]));

        const context: EvictionContext = {
          event: EvictionEvent.CHAIN_PRUNED,
          blockNumber: BlockNumber(3),
        };

        const result = await rule.evict(context, pool);

        expect(result.success).toBe(true);
        expect(result.txsEvicted).toEqual(['0x1111']);
      });
    });

    describe('unknown events', () => {
      it('returns empty result for unknown event type', async () => {
        const pool = createPoolOps(new Map());

        // Force an unknown event type by casting
        const context = {
          event: 'unknown_event' as any,
        } as EvictionContext;

        const result = await rule.evict(context, pool);

        expect(result.success).toBe(true);
        expect(result.txsEvicted).toHaveLength(0);
      });
    });

    describe('error handling', () => {
      it('returns error result when world state sync fails', async () => {
        const meta = createMeta('0x1111', { feeLimit: 100n });
        const txsByFeePayer = new Map([[feePayer1, [meta]]]);
        const pool = createPoolOps(txsByFeePayer);

        mockWorldState.syncImmediate.mockRejectedValue(new Error('Sync failed'));

        const context: EvictionContext = {
          event: EvictionEvent.BLOCK_MINED,
          block: BlockHeader.empty({ globalVariables: GlobalVariables.empty({ blockNumber: BlockNumber(5) }) }),
          newNullifiers: [],
          feePayers: [feePayer1],
        };

        const result = await rule.evict(context, pool);

        expect(result.success).toBe(false);
        expect(result.txsEvicted).toHaveLength(0);
        expect(result.error?.message).toContain('Failed to evict txs due to fee payer balance');
      });

      it('returns error result when deleteTxs fails', async () => {
        const meta = createMeta('0x1111', { feeLimit: 100n });
        const txsByFeePayer = new Map([[feePayer1, [meta]]]);
        const pool = createPoolOps(txsByFeePayer);

        setupBalances(new Map([[feePayer1, 0n]])); // Zero balance to trigger eviction
        deleteTxsMock.mockRejectedValue(new Error('Delete failed'));

        const context: EvictionContext = {
          event: EvictionEvent.TXS_ADDED,
          newTxHashes: ['0x1111'],
          feePayers: [feePayer1],
        };

        const result = await rule.evict(context, pool);

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('Failed to evict txs due to fee payer balance');
      });
    });

    describe('priority ordering verification', () => {
      it('funds high priority tx before low priority when balance is limited', async () => {
        // This test specifically verifies that comparePriority sorts correctly
        // by ensuring the highest priority tx is funded and lowest is evicted
        const tx1 = createMeta('0xaaaa', { feeLimit: 50n, priorityFee: 1n }); // Lowest priority
        const tx2 = createMeta('0xbbbb', { feeLimit: 50n, priorityFee: 2n });
        const tx3 = createMeta('0xcccc', { feeLimit: 50n, priorityFee: 3n }); // Highest priority
        const txsByFeePayer = new Map([[feePayer1, [tx1, tx2, tx3]]]);
        const pool = createPoolOps(txsByFeePayer);

        // Balance covers exactly 2 txs (100)
        setupBalances(new Map([[feePayer1, 100n]]));

        const context: EvictionContext = {
          event: EvictionEvent.TXS_ADDED,
          newTxHashes: ['0xaaaa', '0xbbbb', '0xcccc'],
          feePayers: [feePayer1],
        };

        const result = await rule.evict(context, pool);

        expect(result.success).toBe(true);
        // tx1 (lowest priority) should be evicted
        expect(result.txsEvicted).toEqual(['0xaaaa']);
        // tx2 and tx3 should be kept
        expect(result.txsEvicted).not.toContain('0xbbbb');
        expect(result.txsEvicted).not.toContain('0xcccc');
      });

      it('uses txHash as tiebreaker when priorities are equal', async () => {
        // When priorities are equal, larger txHash should be lower priority
        // Fr.cmp returns negative if a < b, so smaller hash = higher priority in sort
        const txSmallHash = createMeta('0x0001', { feeLimit: 50n, priorityFee: 100n });
        const txLargeHash = createMeta('0xffff', { feeLimit: 50n, priorityFee: 100n });
        const txsByFeePayer = new Map([[feePayer1, [txSmallHash, txLargeHash]]]);
        const pool = createPoolOps(txsByFeePayer);

        // Balance only covers one tx
        setupBalances(new Map([[feePayer1, 50n]]));

        const context: EvictionContext = {
          event: EvictionEvent.TXS_ADDED,
          newTxHashes: ['0x0001', '0xffff'],
          feePayers: [feePayer1],
        };

        const result = await rule.evict(context, pool);

        expect(result.success).toBe(true);
        // One tx should be evicted - the one with lower priority in the tiebreaker
        expect(result.txsEvicted).toHaveLength(1);
        // The result should be deterministic
        const evictedFirst = result.txsEvicted[0];

        // Run again to verify determinism
        const result2 = await rule.evict(context, pool);
        expect(result2.txsEvicted[0]).toEqual(evictedFirst);
      });
    });
  });
});
