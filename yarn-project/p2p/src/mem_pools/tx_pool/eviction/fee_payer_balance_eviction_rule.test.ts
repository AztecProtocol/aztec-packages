import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { MerkleTreeReadOperations, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { mockTx } from '@aztec/stdlib/testing';
import { PublicDataTreeLeaf, PublicDataTreeLeafPreimage } from '@aztec/stdlib/trees';
import { BlockHeader, type Tx, type TxHash } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import {
  type EvictionContext,
  EvictionEvent,
  type FeePayerTxInfo,
  type TxPoolOperations,
} from './eviction_strategy.js';
import { FeePayerBalanceEvictionRule } from './fee_payer_balance_eviction_rule.js';

describe('FeePayerBalanceEvictionRule', () => {
  let txPool: MockProxy<TxPoolOperations>;
  let worldState: MockProxy<MerkleTreeReadOperations>;
  let worldStateSynchronizer: MockProxy<WorldStateSynchronizer>;
  let rule: FeePayerBalanceEvictionRule;

  const setFeePayerBalance = (balance: bigint) => {
    worldState.getPreviousValueIndex.mockResolvedValue({ index: 1n, alreadyPresent: true });
    worldState.getLeafPreimage.mockResolvedValue(
      new PublicDataTreeLeafPreimage(new PublicDataTreeLeaf(Fr.ZERO, new Fr(balance)), Fr.ONE, 1n),
    );
  };

  const mockBalanceEntries = (entries: FeePayerTxInfo[]) => {
    txPool.getFeePayerTxInfos.mockImplementation(async function* (_feePayer) {
      for (const entry of entries) {
        yield entry;
      }
    });
  };

  const buildBalanceEntries = (
    txHashes: TxHash[],
    feeLimit: bigint,
    {
      claimAmount = 0n,
      isEvictable = true,
      priority = 0n,
    }: { claimAmount?: bigint; isEvictable?: boolean; priority?: bigint | bigint[] } = {},
  ): FeePayerTxInfo[] => {
    return txHashes.map((txHash, index) => ({
      txHash,
      feeLimit,
      claimAmount,
      isEvictable,
      priority: Array.isArray(priority) ? (priority[index] ?? 0n) : priority,
    }));
  };

  const txHashes = (...txs: Tx[]) => txs.map(tx => tx.getTxHash());

  const mockTxLookup = (...txs: Tx[]) => {
    const byHash = new Map(txs.map(tx => [tx.getTxHash().toString(), tx]));
    txPool.getTxByHash.mockImplementation(txHash => {
      return Promise.resolve(byHash.get(txHash.toString()));
    });
  };

  beforeEach(() => {
    txPool = mock<TxPoolOperations>();
    txPool.getPendingFeePayers.mockResolvedValue([]);
    worldState = mock<MerkleTreeReadOperations>();
    worldState.getPreviousValueIndex.mockResolvedValue(undefined);
    worldState.getLeafPreimage.mockResolvedValue(
      new PublicDataTreeLeafPreimage(PublicDataTreeLeaf.empty(), Fr.ONE, 1n),
    );

    worldStateSynchronizer = mock<WorldStateSynchronizer>();
    worldStateSynchronizer.getCommitted.mockReturnValue(worldState);
    worldStateSynchronizer.getSnapshot.mockReturnValue(worldState);
    worldStateSynchronizer.syncImmediate.mockResolvedValue(BlockNumber(1));

    rule = new FeePayerBalanceEvictionRule(worldStateSynchronizer);
  });

  describe('evict method', () => {
    it('returns empty result for CHAIN_PRUNED event', async () => {
      const context: EvictionContext = {
        event: EvictionEvent.CHAIN_PRUNED,
        blockNumber: BlockNumber(1),
      };

      const result = await rule.evict(context, txPool);

      expect(result).toEqual({
        reason: 'fee_payer_balance',
        success: true,
        txsEvicted: [],
      });
      expect(txPool.getPendingFeePayers).toHaveBeenCalledTimes(1);
      // Ensure syncImmediate is called before accessing the world state snapshot
      expect(worldStateSynchronizer.syncImmediate).toHaveBeenCalledWith(BlockNumber(1));
    });

    it('returns empty result for TXS_ADDED when no fee payers are provided', async () => {
      const context: EvictionContext = {
        event: EvictionEvent.TXS_ADDED,
        newTxs: [],
        feePayers: [],
      };

      const result = await rule.evict(context, txPool);

      expect(result).toEqual({
        reason: 'fee_payer_balance',
        success: true,
        txsEvicted: [],
      });
      expect(txPool.deleteTxs).not.toHaveBeenCalled();
    });

    it('evicts txs for all fee payers on CHAIN_PRUNED', async () => {
      const feePayer = AztecAddress.fromNumber(42);
      const tx1 = await mockTx(1, { feePayer });
      const tx2 = await mockTx(2, { feePayer });

      mockBalanceEntries(buildBalanceEntries(txHashes(tx1, tx2), 10n, { priority: [2n, 1n] }));
      setFeePayerBalance(5n);
      txPool.getPendingFeePayers.mockResolvedValue([feePayer]);

      const context: EvictionContext = {
        event: EvictionEvent.CHAIN_PRUNED,
        blockNumber: BlockNumber(1),
      };

      const result = await rule.evict(context, txPool);

      expect(result.success).toBe(true);
      expect(result.txsEvicted).toHaveLength(2);
      expect(result.txsEvicted).toEqual(expect.arrayContaining(txHashes(tx1, tx2)));
      expect(txPool.deleteTxs).toHaveBeenCalledWith(expect.arrayContaining(txHashes(tx1, tx2)));
    });

    it('evicts unfunded txs after BLOCK_MINED', async () => {
      const feePayer = AztecAddress.fromNumber(7);
      const tx1 = await mockTx(1, { feePayer });
      const tx2 = await mockTx(2, { feePayer });

      mockBalanceEntries(buildBalanceEntries(txHashes(tx1, tx2), 10n, { priority: [2n, 1n] }));
      setFeePayerBalance(10n);

      const blockHeader = BlockHeader.empty();
      const context: EvictionContext = {
        event: EvictionEvent.BLOCK_MINED,
        block: blockHeader,
        newNullifiers: [],
        feePayers: [feePayer],
      };

      const result = await rule.evict(context, txPool);

      expect(result.success).toBe(true);
      expect(result.txsEvicted).toHaveLength(1);
      expect(result.txsEvicted).toEqual(expect.arrayContaining(txHashes(tx2)));
      expect(result.txsEvicted.map(txHash => txHash.toString())).not.toContain(tx1.getTxHash().toString());
      expect(txPool.deleteTxs).toHaveBeenCalledWith(expect.arrayContaining(txHashes(tx2)));
      // Ensure syncImmediate is called before accessing the world state snapshot
      expect(worldStateSynchronizer.syncImmediate).toHaveBeenCalledWith(blockHeader.getBlockNumber());
    });

    it('handles empty fee payer entries after BLOCK_MINED', async () => {
      const feePayer = AztecAddress.fromNumber(8);
      txPool.getFeePayerTxInfos.mockImplementation(async function* (_feePayer) {});

      const blockHeader = BlockHeader.empty();
      const context: EvictionContext = {
        event: EvictionEvent.BLOCK_MINED,
        block: blockHeader,
        newNullifiers: [],
        feePayers: [feePayer],
      };

      const result = await rule.evict(context, txPool);

      expect(result).toEqual({
        reason: 'fee_payer_balance',
        success: true,
        txsEvicted: [],
      });
      expect(txPool.deleteTxs).not.toHaveBeenCalled();
    });

    it('evicts low priority txs when fee payer balance cannot cover total fee limit', async () => {
      const tx1 = await mockTx(1);
      const tx2 = await mockTx(2);
      const tx3 = await mockTx(3);

      tx2.data.feePayer = tx1.data.feePayer;
      tx3.data.feePayer = tx1.data.feePayer;

      mockTxLookup(tx1, tx2, tx3);

      const feeLimit = 100n;
      mockBalanceEntries(buildBalanceEntries(txHashes(tx1, tx2, tx3), feeLimit, { priority: [1n, 3n, 2n] }));

      setFeePayerBalance(feeLimit * 2n);

      const context: EvictionContext = {
        event: EvictionEvent.TXS_ADDED,
        newTxs: txHashes(tx1, tx2, tx3),
        feePayers: [tx1.data.feePayer],
      };

      const result = await rule.evict(context, txPool);

      expect(result.success).toBe(true);
      expect(result.txsEvicted).toEqual(txHashes(tx1));
      expect(txPool.deleteTxs).toHaveBeenCalledWith(txHashes(tx1));
    });

    it('evaluates multiple fee payers independently', async () => {
      const feePayerA = AztecAddress.fromNumber(1);
      const feePayerB = AztecAddress.fromNumber(2);

      const tx1 = await mockTx(1, { feePayer: feePayerA });
      const tx2 = await mockTx(2, { feePayer: feePayerA });
      const tx3 = await mockTx(3, { feePayer: feePayerB });

      mockTxLookup(tx1, tx2, tx3);

      const feeLimit = 100n;
      const entriesByPayer = new Map<string, FeePayerTxInfo[]>([
        [feePayerA.toString(), buildBalanceEntries(txHashes(tx1, tx2), feeLimit, { priority: [1n, 2n] })],
        [feePayerB.toString(), buildBalanceEntries(txHashes(tx3), feeLimit, { priority: 1n })],
      ]);
      txPool.getFeePayerTxInfos.mockImplementation(async function* (feePayer) {
        for (const entry of entriesByPayer.get(feePayer.toString()) ?? []) {
          yield entry;
        }
      });

      setFeePayerBalance(150n);

      const context: EvictionContext = {
        event: EvictionEvent.TXS_ADDED,
        newTxs: txHashes(tx1, tx2, tx3),
        feePayers: [feePayerA, feePayerB],
      };

      const result = await rule.evict(context, txPool);

      expect(result.success).toBe(true);
      expect(result.txsEvicted).toEqual(txHashes(tx1));
      expect(txPool.deleteTxs).toHaveBeenCalledWith(txHashes(tx1));
    });

    it('stops evicting once the fee payer balance is satisfied', async () => {
      const feePayer = AztecAddress.fromNumber(3);
      const tx1 = await mockTx(1, { feePayer });
      const tx2 = await mockTx(2, { feePayer });
      const tx3 = await mockTx(3, { feePayer });

      mockTxLookup(tx1, tx2, tx3);

      const feeLimit = 100n;
      mockBalanceEntries(buildBalanceEntries(txHashes(tx1, tx2, tx3), feeLimit, { priority: [1n, 2n, 3n] }));

      setFeePayerBalance(150n);

      const context: EvictionContext = {
        event: EvictionEvent.TXS_ADDED,
        newTxs: txHashes(tx1, tx2, tx3),
        feePayers: [feePayer],
      };

      const result = await rule.evict(context, txPool);

      expect(result.txsEvicted).toEqual(expect.arrayContaining(txHashes(tx1, tx2)));
      const deletedTxs = txPool.deleteTxs.mock.calls[0]?.[0] ?? [];
      expect(deletedTxs).toHaveLength(2);
      expect(deletedTxs).toEqual(expect.arrayContaining(txHashes(tx1, tx2)));
    });

    it('keeps txs when fee payer claims enough balance during setup', async () => {
      const tx1 = await mockTx(1);
      const tx2 = await mockTx(2);
      tx2.data.feePayer = tx1.data.feePayer;

      mockTxLookup(tx1, tx2);

      const feeLimit = 100n;
      mockBalanceEntries([
        ...buildBalanceEntries(txHashes(tx1), feeLimit, { claimAmount: feeLimit, priority: 2n }),
        ...buildBalanceEntries(txHashes(tx2), feeLimit, { priority: 1n }),
      ]);

      setFeePayerBalance(feeLimit);

      const context: EvictionContext = {
        event: EvictionEvent.TXS_ADDED,
        newTxs: txHashes(tx1, tx2),
        feePayers: [tx1.data.feePayer],
      };

      const result = await rule.evict(context, txPool);

      expect(result).toEqual({
        reason: 'fee_payer_balance',
        success: true,
        txsEvicted: [],
      });
      expect(txPool.deleteTxs).not.toHaveBeenCalled();
    });

    it('does not fund later txs with claims from evicted txs', async () => {
      const tx1 = await mockTx(1);
      const tx2 = await mockTx(2);
      tx2.data.feePayer = tx1.data.feePayer;

      mockBalanceEntries([
        ...buildBalanceEntries(txHashes(tx1), 20n, { claimAmount: 10n, priority: 2n }),
        ...buildBalanceEntries(txHashes(tx2), 12n, { priority: 1n }),
      ]);

      setFeePayerBalance(5n);

      const context: EvictionContext = {
        event: EvictionEvent.TXS_ADDED,
        newTxs: txHashes(tx1, tx2),
        feePayers: [tx1.data.feePayer],
      };

      const result = await rule.evict(context, txPool);

      expect(result.success).toBe(true);
      expect(result.txsEvicted).toHaveLength(2);
      expect(result.txsEvicted).toEqual(expect.arrayContaining(txHashes(tx1, tx2)));
      const deletedTxs = txPool.deleteTxs.mock.calls[0]?.[0] ?? [];
      expect(deletedTxs).toHaveLength(2);
      expect(deletedTxs).toEqual(expect.arrayContaining(txHashes(tx1, tx2)));
    });

    it('keeps multiple lower-priority txs funded by higher-priority claims', async () => {
      const tx1 = await mockTx(1);
      const tx2 = await mockTx(2);
      const tx3 = await mockTx(3);

      tx2.data.feePayer = tx1.data.feePayer;
      tx3.data.feePayer = tx1.data.feePayer;

      mockBalanceEntries([
        ...buildBalanceEntries(txHashes(tx1), 1n, { claimAmount: 100n, priority: 3n }),
        ...buildBalanceEntries(txHashes(tx2), 30n, { priority: 2n }),
        ...buildBalanceEntries(txHashes(tx3), 60n, { priority: 1n }),
      ]);

      setFeePayerBalance(0n);

      const context: EvictionContext = {
        event: EvictionEvent.TXS_ADDED,
        newTxs: txHashes(tx1, tx2, tx3),
        feePayers: [tx1.data.feePayer],
      };

      const result = await rule.evict(context, txPool);

      expect(result).toEqual({
        reason: 'fee_payer_balance',
        success: true,
        txsEvicted: [],
      });
      expect(txPool.deleteTxs).not.toHaveBeenCalled();
    });

    it('handles equal priority ties deterministically', async () => {
      const txClaim = await mockTx(1);
      const txSpend = await mockTx(2);
      txSpend.data.feePayer = txClaim.data.feePayer;

      mockBalanceEntries([
        ...buildBalanceEntries(txHashes(txClaim), 10n, { claimAmount: 100n, priority: 1n }),
        ...buildBalanceEntries(txHashes(txSpend), 90n, { priority: 1n }),
      ]);

      setFeePayerBalance(0n);

      const context: EvictionContext = {
        event: EvictionEvent.TXS_ADDED,
        newTxs: txHashes(txClaim, txSpend),
        feePayers: [txClaim.data.feePayer],
      };

      const result = await rule.evict(context, txPool);

      const claimFirst = txClaim.getTxHash().toBigInt() >= txSpend.getTxHash().toBigInt();
      if (claimFirst) {
        expect(result).toEqual({
          reason: 'fee_payer_balance',
          success: true,
          txsEvicted: [],
        });
        expect(txPool.deleteTxs).not.toHaveBeenCalled();
      } else {
        expect(result.success).toBe(true);
        expect(result.txsEvicted).toHaveLength(1);
        expect(result.txsEvicted).toEqual(expect.arrayContaining(txHashes(txSpend)));
        expect(txPool.deleteTxs).toHaveBeenCalledWith(txHashes(txSpend));
      }
    });

    it('evicts all txs when balance is too low', async () => {
      const tx1 = await mockTx(1);
      const tx2 = await mockTx(2);
      const tx3 = await mockTx(3);

      tx2.data.feePayer = tx1.data.feePayer;
      tx3.data.feePayer = tx1.data.feePayer;

      const feeLimit = 50n;
      mockBalanceEntries(buildBalanceEntries(txHashes(tx1, tx2, tx3), feeLimit, { priority: [3n, 2n, 1n] }));

      setFeePayerBalance(0n);

      const context: EvictionContext = {
        event: EvictionEvent.TXS_ADDED,
        newTxs: txHashes(tx1, tx2, tx3),
        feePayers: [tx1.data.feePayer],
      };

      const result = await rule.evict(context, txPool);

      expect(result.success).toBe(true);
      expect(result.txsEvicted).toHaveLength(3);
      expect(result.txsEvicted).toEqual(expect.arrayContaining(txHashes(tx1, tx2, tx3)));
      const deletedTxs = txPool.deleteTxs.mock.calls[0]?.[0] ?? [];
      expect(deletedTxs).toHaveLength(3);
      expect(deletedTxs).toEqual(expect.arrayContaining(txHashes(tx1, tx2, tx3)));
    });

    it('evicts later txs when balance is exactly exhausted', async () => {
      const tx1 = await mockTx(1);
      const tx2 = await mockTx(2);
      tx2.data.feePayer = tx1.data.feePayer;

      mockBalanceEntries([
        ...buildBalanceEntries(txHashes(tx1), 10n, { priority: 2n }),
        ...buildBalanceEntries(txHashes(tx2), 1n, { priority: 1n }),
      ]);

      setFeePayerBalance(10n);

      const context: EvictionContext = {
        event: EvictionEvent.TXS_ADDED,
        newTxs: txHashes(tx1, tx2),
        feePayers: [tx1.data.feePayer],
      };

      const result = await rule.evict(context, txPool);

      expect(result.success).toBe(true);
      expect(result.txsEvicted).toHaveLength(1);
      expect(result.txsEvicted).toEqual(expect.arrayContaining(txHashes(tx2)));
      expect(result.txsEvicted.map(txHash => txHash.toString())).not.toContain(tx1.getTxHash().toString());
      expect(txPool.deleteTxs).toHaveBeenCalledWith(txHashes(tx2));
    });

    it('keeps non-evictable txs even when over balance', async () => {
      const tx1 = await mockTx(1);
      const tx2 = await mockTx(2);
      tx2.data.feePayer = tx1.data.feePayer;

      mockBalanceEntries([
        ...buildBalanceEntries(txHashes(tx1), 10n, { isEvictable: false, priority: 2n }),
        ...buildBalanceEntries(txHashes(tx2), 20n, { isEvictable: false, priority: 1n }),
      ]);

      setFeePayerBalance(0n);

      const context: EvictionContext = {
        event: EvictionEvent.TXS_ADDED,
        newTxs: txHashes(tx1, tx2),
        feePayers: [tx1.data.feePayer],
      };

      const result = await rule.evict(context, txPool);

      expect(result).toEqual({
        reason: 'fee_payer_balance',
        success: true,
        txsEvicted: [],
      });
      expect(txPool.deleteTxs).not.toHaveBeenCalled();
    });

    it('evicts only evictable txs when the top tx is non-evictable and unfunded', async () => {
      const tx1 = await mockTx(1);
      const tx2 = await mockTx(2);
      tx2.data.feePayer = tx1.data.feePayer;

      mockBalanceEntries([
        ...buildBalanceEntries(txHashes(tx1), 10n, { isEvictable: false, priority: 2n }),
        ...buildBalanceEntries(txHashes(tx2), 1n, { priority: 1n }),
      ]);

      setFeePayerBalance(0n);

      const context: EvictionContext = {
        event: EvictionEvent.TXS_ADDED,
        newTxs: txHashes(tx1, tx2),
        feePayers: [tx1.data.feePayer],
      };

      const result = await rule.evict(context, txPool);

      expect(result.success).toBe(true);
      expect(result.txsEvicted).toHaveLength(1);
      expect(result.txsEvicted).toEqual(expect.arrayContaining(txHashes(tx2)));
      expect(result.txsEvicted.map(txHash => txHash.toString())).not.toContain(tx1.getTxHash().toString());
      expect(txPool.deleteTxs).toHaveBeenCalledWith(txHashes(tx2));
    });

    it('respects non-evictable txs when fee payer balance is exceeded', async () => {
      const tx1 = await mockTx(1);
      const tx2 = await mockTx(2);
      tx2.data.feePayer = tx1.data.feePayer;

      const feeLimit = 100n;
      mockBalanceEntries([
        ...buildBalanceEntries(txHashes(tx1), feeLimit, { isEvictable: false, priority: 2n }),
        ...buildBalanceEntries(txHashes(tx2), feeLimit, { priority: 1n }),
      ]);

      setFeePayerBalance(feeLimit);

      const blockHeader = BlockHeader.empty();
      const context: EvictionContext = {
        event: EvictionEvent.BLOCK_MINED,
        block: blockHeader,
        newNullifiers: [],
        feePayers: [tx1.data.feePayer],
      };

      const result = await rule.evict(context, txPool);

      expect(result.success).toBe(true);
      expect(result.txsEvicted).toEqual(txHashes(tx2));
      expect(txPool.deleteTxs).toHaveBeenCalledWith(txHashes(tx2));
    });

    it('evicts higher-priority spends that rely on lower-priority claims', async () => {
      const tx1 = await mockTx(1);
      const tx2 = await mockTx(2);
      tx2.data.feePayer = tx1.data.feePayer;

      const feeLimit = 100n;
      mockBalanceEntries([
        ...buildBalanceEntries(txHashes(tx1), feeLimit, { priority: 2n }),
        ...buildBalanceEntries(txHashes(tx2), 1n, { claimAmount: feeLimit, priority: 1n }),
      ]);

      setFeePayerBalance(50n);

      const context: EvictionContext = {
        event: EvictionEvent.TXS_ADDED,
        newTxs: txHashes(tx1, tx2),
        feePayers: [tx1.data.feePayer],
      };

      const result = await rule.evict(context, txPool);

      expect(result.success).toBe(true);
      expect(result.txsEvicted).toEqual(txHashes(tx1));
      expect(txPool.deleteTxs).toHaveBeenCalledWith(txHashes(tx1));
    });

    it('returns failure when storage access fails', async () => {
      const feePayer = AztecAddress.fromNumber(5);
      const tx1 = await mockTx(1, { feePayer });

      txPool.getTxByHash.mockResolvedValue(tx1);
      mockBalanceEntries(buildBalanceEntries(txHashes(tx1), 100n));

      worldState.getPreviousValueIndex.mockRejectedValueOnce(new Error('db failure'));

      const context: EvictionContext = {
        event: EvictionEvent.TXS_ADDED,
        newTxs: txHashes(tx1),
        feePayers: [feePayer],
      };

      const result = await rule.evict(context, txPool);

      expect(result.success).toBe(false);
      expect(result.txsEvicted).toEqual([]);
      expect(result.error).toBeDefined();
      expect(txPool.deleteTxs).not.toHaveBeenCalled();
    });
  });
});
