import { BlockNumber } from '@aztec/foundation/branded-types';
import { GasFees } from '@aztec/stdlib/gas';
import { BlockHeader } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';

import { type TxMetaData, stubTxMetaData } from '../tx_metadata.js';
import { InsufficientFeePerGasEvictionRule } from './insufficient_fee_per_gas_eviction_rule.js';
import type { EvictionContext, PoolOperations } from './interfaces.js';
import { EvictionEvent } from './interfaces.js';

describe('InsufficientFeePerGasEvictionRule', () => {
  let pool: PoolOperations;
  let rule: InsufficientFeePerGasEvictionRule;
  let deleteTxsMock: jest.MockedFunction<any>;

  const blockGasFees = new GasFees(10, 20);

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
    rule = new InsufficientFeePerGasEvictionRule({ getCurrentMinFees: () => Promise.resolve(blockGasFees) });
  });

  describe('non-BLOCK_MINED events', () => {
    it('returns empty result for TXS_ADDED event', async () => {
      const context: EvictionContext = {
        event: EvictionEvent.TXS_ADDED,
        newTxHashes: [],
        feePayers: [],
      };

      const result = await rule.evict(context, pool);

      expect(result).toEqual({
        reason: 'insufficient_fee_per_gas',
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
        reason: 'insufficient_fee_per_gas',
        success: true,
        txsEvicted: [],
      });
    });
  });

  describe('BLOCK_MINED events', () => {
    let blockHeader: BlockHeader;

    beforeEach(() => {
      blockHeader = BlockHeader.empty();
      blockHeader.globalVariables.blockNumber = BlockNumber(100);
      blockHeader.globalVariables.timestamp = 1000n;
      blockHeader.globalVariables.gasFees = new GasFees(10, 20);
    });

    it('evicts txs with insufficient DA fee per gas', async () => {
      const tx1 = stubTxMetaData('0x1111', { maxFeesPerGas: new GasFees(9, 20) }); // DA too low
      const tx2 = stubTxMetaData('0x2222', { maxFeesPerGas: new GasFees(10, 20) }); // Exactly enough

      pool = createPoolOps([tx1, tx2]);

      const context: EvictionContext = {
        event: EvictionEvent.BLOCK_MINED,
        block: blockHeader,
        newNullifiers: [],
        feePayers: [],
      };

      const result = await rule.evict(context, pool);

      expect(result.success).toBe(true);
      expect(result.txsEvicted).toEqual([tx1.txHash]);
      expect(deleteTxsMock).toHaveBeenCalledWith([tx1.txHash], 'InsufficientFeePerGas');
    });

    it('evicts txs with insufficient L2 fee per gas', async () => {
      const tx1 = stubTxMetaData('0x1111', { maxFeesPerGas: new GasFees(10, 19) }); // L2 too low
      const tx2 = stubTxMetaData('0x2222', { maxFeesPerGas: new GasFees(10, 20) }); // Exactly enough

      pool = createPoolOps([tx1, tx2]);

      const context: EvictionContext = {
        event: EvictionEvent.BLOCK_MINED,
        block: blockHeader,
        newNullifiers: [],
        feePayers: [],
      };

      const result = await rule.evict(context, pool);

      expect(result.success).toBe(true);
      expect(result.txsEvicted).toEqual([tx1.txHash]);
      expect(deleteTxsMock).toHaveBeenCalledWith([tx1.txHash], 'InsufficientFeePerGas');
    });

    it('keeps txs with sufficient fees', async () => {
      const tx1 = stubTxMetaData('0x1111', { maxFeesPerGas: new GasFees(10, 20) });
      const tx2 = stubTxMetaData('0x2222', { maxFeesPerGas: new GasFees(100, 200) });

      pool = createPoolOps([tx1, tx2]);

      const context: EvictionContext = {
        event: EvictionEvent.BLOCK_MINED,
        block: blockHeader,
        newNullifiers: [],
        feePayers: [],
      };

      const result = await rule.evict(context, pool);

      expect(result.success).toBe(true);
      expect(result.txsEvicted).toEqual([]);
      expect(deleteTxsMock).not.toHaveBeenCalled();
    });

    it('handles empty pending list', async () => {
      pool = createPoolOps([]);

      const context: EvictionContext = {
        event: EvictionEvent.BLOCK_MINED,
        block: blockHeader,
        newNullifiers: [],
        feePayers: [],
      };

      const result = await rule.evict(context, pool);

      expect(result).toEqual({
        reason: 'insufficient_fee_per_gas',
        success: true,
        txsEvicted: [],
      });
      expect(deleteTxsMock).not.toHaveBeenCalled();
    });

    it('uses blockMinFeesProvider to determine eviction threshold', async () => {
      // blockMinFeesProvider returns lower projected fees (5, 10) than block header (10, 20)
      const getCurrentMinFees = jest.fn(() => Promise.resolve(new GasFees(5, 10)));
      rule = new InsufficientFeePerGasEvictionRule({ getCurrentMinFees });

      const tx1 = stubTxMetaData('0x1111', { maxFeesPerGas: new GasFees(5, 10) }); // Sufficient for projected fees
      const tx2 = stubTxMetaData('0x2222', { maxFeesPerGas: new GasFees(4, 10) }); // DA too low for projected fees

      pool = createPoolOps([tx1, tx2]);

      const context: EvictionContext = {
        event: EvictionEvent.BLOCK_MINED,
        block: blockHeader,
        newNullifiers: [],
        feePayers: [],
      };

      const result = await rule.evict(context, pool);

      expect(getCurrentMinFees).toHaveBeenCalled();
      expect(result.success).toBe(true);
      // Only tx2 is evicted (DA fee 4 < projected 5), tx1 is kept despite block header fees being higher
      expect(result.txsEvicted).toEqual([tx2.txHash]);
      expect(deleteTxsMock).toHaveBeenCalledWith([tx2.txHash], 'InsufficientFeePerGas');
    });
  });
});
