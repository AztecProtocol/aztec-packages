import { BlockNumber, EpochNumber } from '@aztec/foundation/branded-types';
import { BlockHash } from '@aztec/stdlib/block';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import {
  DroppedTxReceipt,
  MinedTxReceipt,
  type MinedTxStatus,
  PendingTxReceipt,
  TxExecutionResult,
  TxHash,
  type TxReceipt,
  TxStatus,
} from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import { waitForTx } from './node.js';

describe('waitForTx', () => {
  let node: MockProxy<AztecNode>;
  let txHash: TxHash;

  const minedReceipt = (status: MinedTxStatus, executionResult = TxExecutionResult.SUCCESS): MinedTxReceipt =>
    new MinedTxReceipt(txHash, status, executionResult, 1n, BlockHash.random(), BlockNumber(20), 0, EpochNumber(1));

  beforeEach(() => {
    node = mock();
    txHash = TxHash.random();
  });

  describe('basic behavior', () => {
    let txReceipt: TxReceipt;
    beforeEach(() => {
      txReceipt = minedReceipt(TxStatus.CHECKPOINTED);
      node.getTxReceipt.mockResolvedValue(txReceipt);
    });

    it('throws if tx is dropped', async () => {
      const droppedReceipt = new DroppedTxReceipt(txHash, 'Tx dropped');
      node.getTxReceipt.mockResolvedValue(droppedReceipt);
      await expect(waitForTx(node, txHash, { timeout: 1, interval: 0.4, ignoreDroppedReceiptsFor: 0 })).rejects.toThrow(
        /dropped/,
      );
    });

    it('throws if tx reverts and dontThrowOnRevert is false', async () => {
      const revertedReceipt = minedReceipt(TxStatus.CHECKPOINTED, TxExecutionResult.REVERTED);
      node.getTxReceipt.mockResolvedValue(revertedReceipt);
      await expect(waitForTx(node, txHash, { timeout: 1, interval: 0.4 })).rejects.toThrow(/reverted/);
    });

    it('does not throw if tx reverts and dontThrowOnRevert is true', async () => {
      const revertedReceipt = minedReceipt(TxStatus.CHECKPOINTED, TxExecutionResult.REVERTED);
      node.getTxReceipt.mockResolvedValue(revertedReceipt);
      const receipt = await waitForTx(node, txHash, { timeout: 1, interval: 0.4, dontThrowOnRevert: true });
      expect(receipt.hasExecutionReverted()).toBe(true);
    });

    it('keeps waiting while the tx is pending', async () => {
      node.getTxReceipt
        .mockResolvedValueOnce(new PendingTxReceipt(txHash))
        .mockResolvedValueOnce(minedReceipt(TxStatus.CHECKPOINTED));
      const receipt = await waitForTx(node, txHash, { timeout: 1, interval: 0.1 });
      expect(receipt.status).toBe(TxStatus.CHECKPOINTED);
      expect(node.getTxReceipt).toHaveBeenCalledTimes(2);
    });
  });

  describe('waitForStatus option', () => {
    it('returns immediately when receipt status matches requested status', async () => {
      node.getTxReceipt.mockResolvedValue(minedReceipt(TxStatus.CHECKPOINTED));

      const receipt = await waitForTx(node, txHash, {
        timeout: 1,
        interval: 0.1,
        waitForStatus: TxStatus.CHECKPOINTED,
      });
      expect(receipt.status).toBe(TxStatus.CHECKPOINTED);
    });

    it('returns when receipt status exceeds requested status', async () => {
      node.getTxReceipt.mockResolvedValue(minedReceipt(TxStatus.PROVEN));

      // Request CHECKPOINTED, but receive PROVEN - should return immediately
      const receipt = await waitForTx(node, txHash, {
        timeout: 1,
        interval: 0.1,
        waitForStatus: TxStatus.CHECKPOINTED,
      });
      expect(receipt.status).toBe(TxStatus.PROVEN);
    });

    it('waits until receipt reaches requested status', async () => {
      const proposedReceipt = minedReceipt(TxStatus.PROPOSED);
      const checkpointedReceipt = minedReceipt(TxStatus.CHECKPOINTED);

      // First call returns PROPOSED, second returns CHECKPOINTED
      node.getTxReceipt
        .mockResolvedValueOnce(proposedReceipt)
        .mockResolvedValueOnce(proposedReceipt)
        .mockResolvedValueOnce(checkpointedReceipt);

      const receipt = await waitForTx(node, txHash, {
        timeout: 2,
        interval: 0.1,
        waitForStatus: TxStatus.CHECKPOINTED,
      });
      expect(receipt.status).toBe(TxStatus.CHECKPOINTED);
      expect(node.getTxReceipt).toHaveBeenCalledTimes(3);
    });

    it('times out if receipt never reaches requested status', async () => {
      node.getTxReceipt.mockResolvedValue(minedReceipt(TxStatus.PROPOSED));

      // Request PROVEN but only get PROPOSED
      await expect(
        waitForTx(node, txHash, { timeout: 0.5, interval: 0.1, waitForStatus: TxStatus.PROVEN }),
      ).rejects.toThrow(/Timeout/);
    });

    it('defaults to CHECKPOINTED if waitForStatus is not specified', async () => {
      node.getTxReceipt.mockResolvedValue(minedReceipt(TxStatus.CHECKPOINTED));

      const receipt = await waitForTx(node, txHash, { timeout: 1, interval: 0.1 });
      expect(receipt.status).toBe(TxStatus.CHECKPOINTED);
    });
  });
});
