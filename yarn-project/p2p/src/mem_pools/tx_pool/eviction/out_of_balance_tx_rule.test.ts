import { Fr } from '@aztec/foundation/fields';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { MerkleTreeReadOperations } from '@aztec/stdlib/interfaces/server';
import { mockTx } from '@aztec/stdlib/testing';
import { PublicDataTreeLeaf, PublicDataTreeLeafPreimage } from '@aztec/stdlib/trees';
import { BlockHeader, TxHash } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import { type EvictionContext, EvictionEvent, type PendingTxInfo, type TxPoolOperations } from './eviction_strategy.js';
import { OutOfBalanceTxsAfterMining } from './out_of_balance_tx_rule.js';

describe('OutOfBalanceTxsAfterMining', () => {
  let txPool: MockProxy<TxPoolOperations>;
  let worldState: MockProxy<MerkleTreeReadOperations>;
  let rule: OutOfBalanceTxsAfterMining;

  beforeEach(() => {
    txPool = mock<TxPoolOperations>();
    txPool.getPendingTxs.mockResolvedValue([]);
    txPool.getPendingTxsWithFeePayer.mockResolvedValue([]);

    worldState = mock<MerkleTreeReadOperations>();
    worldState.getPreviousValueIndex.mockResolvedValue(undefined),
      worldState.getLeafPreimage.mockResolvedValue(
        new PublicDataTreeLeafPreimage(PublicDataTreeLeaf.empty(), Fr.ONE, 1n),
      );

    rule = new OutOfBalanceTxsAfterMining({
      getSnapshot: () => worldState,
      getCommitted: () => worldState,
    });
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
          reason: 'insufficient_fee_juice',
          success: true,
          txsEvicted: [],
        });
      });

      it('returns empty result for CHAIN_PRUNED event', async () => {
        const context: EvictionContext = {
          event: EvictionEvent.CHAIN_PRUNED,
          blockNumber: 1,
        };

        const result = await rule.evict(context, txPool);

        expect(result).toEqual({
          reason: 'insufficient_fee_juice',
          success: true,
          txsEvicted: [],
        });
      });
    });

    describe('BLOCK_MINED events', () => {
      let context: EvictionContext;
      let blockHeader: BlockHeader;
      let feePayers: AztecAddress[];

      beforeEach(async () => {
        blockHeader = BlockHeader.empty();
        blockHeader.globalVariables.blockNumber = 100;
        blockHeader.globalVariables.timestamp = 1000n;

        feePayers = [await AztecAddress.random(), await AztecAddress.random()];
        context = {
          event: EvictionEvent.BLOCK_MINED,
          block: blockHeader,
          newNullifiers: [Fr.random(), Fr.random()],
          minedFeePayers: feePayers,
        };
      });

      it('evicts transaction that can not pay for gas', async () => {
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

        const pendingTxs: PendingTxInfo[] = [
          { txHash: tx1, blockHash: Fr.ZERO, isEvictable: true },
          { txHash: tx2, blockHash: Fr.ZERO, isEvictable: true },
        ];
        txPool.getPendingTxsWithFeePayer.mockResolvedValue(pendingTxs);
        txPool.getTxByHash.mockImplementation(txHash => {
          if (txHash.equals(tx1)) {
            return Promise.resolve(mockTx1);
          }
          if (txHash.equals(tx2)) {
            return Promise.resolve(mockTx2);
          }
          return Promise.resolve(undefined);
        });

        worldState.getPreviousValueIndex
          .mockResolvedValueOnce({ index: 42n, alreadyPresent: true })
          .mockResolvedValueOnce({ index: 123n, alreadyPresent: true })
          .mockResolvedValue(undefined);

        worldState.getLeafPreimage
          .mockResolvedValueOnce(new PublicDataTreeLeafPreimage(new PublicDataTreeLeaf(Fr.ZERO, new Fr(1)), Fr.ONE, 1n))
          .mockResolvedValueOnce(
            new PublicDataTreeLeafPreimage(new PublicDataTreeLeaf(Fr.ONE, new Fr(1e18)), Fr.ONE, 1n),
          );

        const result = await rule.evict(context, txPool);

        expect(result.success).toBe(true);
        expect(result.txsEvicted).toEqual([tx1]); // Only tx1 has duplicate nullifier
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

        mockEvictableTx.data.feePayer = feePayers[0];
        mockNonEvictableTx.data.feePayer = feePayers[1];

        const pendingTxs: PendingTxInfo[] = [
          { txHash: evictableTx, blockHash: Fr.ZERO, isEvictable: true },
          { txHash: nonEvictableTx, blockHash: Fr.ZERO, isEvictable: false },
        ];
        txPool.getPendingTxsWithFeePayer.mockResolvedValue(pendingTxs);
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
        txPool.getPendingTxsWithFeePayer.mockResolvedValue([]);

        const result = await rule.evict(context, txPool);

        expect(result).toEqual({
          reason: 'insufficient_fee_juice',
          success: true,
          txsEvicted: [],
        });
        expect(txPool.deleteTxs).not.toHaveBeenCalled();
      });
    });
  });
});
