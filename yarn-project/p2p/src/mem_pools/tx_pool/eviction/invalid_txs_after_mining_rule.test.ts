import { Fr } from '@aztec/foundation/fields';
import { mockTx } from '@aztec/stdlib/testing';
import { BlockHeader, TxHash } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import { type EvictionContext, EvictionEvent, type PendingTxInfo, type TxPoolOperations } from './eviction_strategy.js';
import { InvalidTxsAfterMiningRule } from './invalid_txs_after_mining_rule.js';

describe('InvalidTxsAfterMiningRule', () => {
  let txPool: MockProxy<TxPoolOperations>;
  let rule: InvalidTxsAfterMiningRule;

  beforeEach(() => {
    txPool = mock<TxPoolOperations>();
    rule = new InvalidTxsAfterMiningRule();
  });

  describe('evict method', () => {
    describe('non-BLOCK_MINED events', () => {
      it('returns empty result for TXS_ADDED event', async () => {
        const context: EvictionContext = {
          event: EvictionEvent.TXS_ADDED,
          newTxs: [],
        };

        const result = await rule.evict(context, txPool);

        expect(result).toEqual({
          reason: 'block_mined_invalid_txs',
          success: true,
          txsEvicted: [],
        });
      });

      it('returns empty result for CHAIN_PRUNED event', async () => {
        const context: EvictionContext = {
          event: EvictionEvent.CHAIN_PRUNED,
          block: BlockHeader.empty(),
        };

        const result = await rule.evict(context, txPool);

        expect(result).toEqual({
          reason: 'block_mined_invalid_txs',
          success: true,
          txsEvicted: [],
        });
      });
    });

    describe('BLOCK_MINED events', () => {
      let context: EvictionContext;
      let blockHeader: BlockHeader;
      let newNullifiers: Fr[];

      beforeEach(() => {
        blockHeader = BlockHeader.empty();
        blockHeader.globalVariables.blockNumber = 100;
        blockHeader.globalVariables.timestamp = 1000n;

        newNullifiers = [Fr.random(), Fr.random()];
        context = {
          event: EvictionEvent.BLOCK_MINED,
          block: blockHeader,
          newNullifiers,
          minedFeePayers: [],
        };
      });

      it('evicts transactions with duplicate nullifiers', async () => {
        const tx1 = TxHash.random();
        const tx2 = TxHash.random();

        // Create real mock transactions with proper structure
        const mockTx1 = await mockTx(1, {
          numberOfNonRevertiblePublicCallRequests: 0,
          numberOfRevertiblePublicCallRequests: 0,
        });
        const mockTx2 = await mockTx(2, {
          numberOfNonRevertiblePublicCallRequests: 0,
          numberOfRevertiblePublicCallRequests: 0,
        });

        // Mock the nullifiers - tx1 has a duplicate
        mockTx1.data.forRollup!.end.nullifiers[0] = newNullifiers[0];

        const pendingTxs: PendingTxInfo[] = [
          { blockHash: Fr.ZERO, txHash: tx1, isEvictable: true },
          { blockHash: Fr.ZERO, txHash: tx2, isEvictable: true },
        ];
        txPool.getPendingTxs.mockResolvedValue(pendingTxs);
        txPool.getTxByHash.mockImplementation(txHash => {
          if (txHash.equals(tx1)) {
            return Promise.resolve(mockTx1);
          }
          if (txHash.equals(tx2)) {
            return Promise.resolve(mockTx2);
          }
          return Promise.resolve(undefined);
        });

        const result = await rule.evict(context, txPool);

        expect(result.success).toBe(true);
        expect(result.txsEvicted).toEqual([tx1]); // Only tx1 has duplicate nullifier
        expect(txPool.deleteTxs).toHaveBeenCalledWith([tx1], true);
      });

      it('evicts transactions with expired timestamps', async () => {
        const tx1 = TxHash.random();
        const tx2 = TxHash.random();

        const mockTx1 = await mockTx(1, {
          numberOfNonRevertiblePublicCallRequests: 0,
          numberOfRevertiblePublicCallRequests: 0,
        });
        const mockTx2 = await mockTx(2, {
          numberOfNonRevertiblePublicCallRequests: 0,
          numberOfRevertiblePublicCallRequests: 0,
        });

        mockTx1.data.includeByTimestamp = 500n;
        mockTx2.data.includeByTimestamp = 1500n;

        const pendingTxs: PendingTxInfo[] = [
          { blockHash: Fr.ZERO, txHash: tx1, isEvictable: true },
          { blockHash: Fr.ZERO, txHash: tx2, isEvictable: true },
        ];
        txPool.getPendingTxs.mockResolvedValue(pendingTxs);
        txPool.getTxByHash.mockImplementation(txHash => {
          if (txHash.equals(tx1)) {
            return Promise.resolve(mockTx1);
          }
          if (txHash.equals(tx2)) {
            return Promise.resolve(mockTx2);
          }
          return Promise.resolve(undefined);
        });

        const result = await rule.evict(context, txPool);

        expect(result.success).toBe(true);
        expect(result.txsEvicted).toEqual([tx1]); // Only tx1 is expired
        expect(txPool.deleteTxs).toHaveBeenCalledWith([tx1], true);
      });

      it('respects non-evictable transactions', async () => {
        const evictableTx = TxHash.random();
        const nonEvictableTx = TxHash.random();

        // Create real mock transactions with proper structure
        const mockEvictableTx = await mockTx(1, {
          numberOfNonRevertiblePublicCallRequests: 0,
          numberOfRevertiblePublicCallRequests: 0,
        });
        const mockNonEvictableTx = await mockTx(2, {
          numberOfNonRevertiblePublicCallRequests: 0,
          numberOfRevertiblePublicCallRequests: 0,
        });

        // Both transactions have duplicate nullifiers, but only one is evictable
        mockEvictableTx.data.forRollup!.end.nullifiers[0] = newNullifiers[0];
        mockNonEvictableTx.data.forRollup!.end.nullifiers[0] = newNullifiers[0];

        const pendingTxs: PendingTxInfo[] = [
          { blockHash: Fr.ZERO, txHash: evictableTx, isEvictable: true },
          { blockHash: Fr.ZERO, txHash: nonEvictableTx, isEvictable: false },
        ];
        txPool.getPendingTxs.mockResolvedValue(pendingTxs);
        txPool.getTxByHash.mockImplementation(txHash => {
          if (txHash.equals(evictableTx)) {
            return Promise.resolve(mockEvictableTx);
          }
          if (txHash.equals(nonEvictableTx)) {
            return Promise.resolve(mockNonEvictableTx);
          }
          return Promise.resolve(undefined);
        });

        const result = await rule.evict(context, txPool);

        expect(result.success).toBe(true);
        expect(result.txsEvicted).toEqual([evictableTx]); // Only evictable tx is evicted
        expect(txPool.deleteTxs).toHaveBeenCalledWith([evictableTx], true);
      });

      it('handles empty pending transactions list', async () => {
        txPool.getPendingTxs.mockResolvedValue([]);

        const result = await rule.evict(context, txPool);

        expect(result).toEqual({
          reason: 'block_mined_invalid_txs',
          success: true,
          txsEvicted: [],
        });
        expect(txPool.deleteTxs).not.toHaveBeenCalled();
      });
    });
  });
});
