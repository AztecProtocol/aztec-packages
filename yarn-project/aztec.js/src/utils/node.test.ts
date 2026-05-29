import { BlockNumber } from '@aztec/foundation/branded-types';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { TxExecutionResult, TxHash, TxReceipt, TxStatus } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import { waitForTx } from './node.js';

describe('waitForTx', () => {
  let node: MockProxy<AztecNode>;
  let txHash: TxHash;

  beforeEach(() => {
    node = mock();
    txHash = TxHash.random();
  });

  describe('basic behavior', () => {
    let txReceipt: TxReceipt;
    beforeEach(() => {
      txReceipt = new TxReceipt(
        txHash,
        TxStatus.CHECKPOINTED,
        TxExecutionResult.SUCCESS,
        undefined,
        undefined,
        undefined,
        BlockNumber(20),
      );
      node.getTxReceipt.mockResolvedValue(txReceipt);
    });

    it('throws if tx is dropped', async () => {
      const droppedReceipt = new TxReceipt(txHash, TxStatus.DROPPED, undefined, 'Tx dropped');
      node.getTxReceipt.mockResolvedValue(droppedReceipt);
      await expect(waitForTx(node, txHash, { timeout: 1, interval: 0.4, ignoreDroppedReceiptsFor: 0 })).rejects.toThrow(
        /dropped/,
      );
    });

    it('throws if tx reverts and dontThrowOnRevert is false', async () => {
      const revertedReceipt = new TxReceipt(
        txHash,
        TxStatus.CHECKPOINTED,
        TxExecutionResult.REVERTED,
        undefined,
        undefined,
        undefined,
        BlockNumber(20),
      );
      node.getTxReceipt.mockResolvedValue(revertedReceipt);
      await expect(waitForTx(node, txHash, { timeout: 1, interval: 0.4 })).rejects.toThrow(/reverted/);
    });

    it('does not throw if tx reverts and dontThrowOnRevert is true', async () => {
      const revertedReceipt = new TxReceipt(
        txHash,
        TxStatus.CHECKPOINTED,
        TxExecutionResult.REVERTED,
        undefined,
        undefined,
        undefined,
        BlockNumber(20),
      );
      node.getTxReceipt.mockResolvedValue(revertedReceipt);
      const receipt = await waitForTx(node, txHash, { timeout: 1, interval: 0.4, dontThrowOnRevert: true });
      expect(receipt.hasExecutionReverted()).toBe(true);
    });
  });

  describe('waitForStatus option', () => {
    it('returns immediately when receipt status matches requested status', async () => {
      const checkpointedReceipt = new TxReceipt(
        txHash,
        TxStatus.CHECKPOINTED,
        TxExecutionResult.SUCCESS,
        undefined,
        undefined,
        undefined,
        BlockNumber(20),
      );
      node.getTxReceipt.mockResolvedValue(checkpointedReceipt);

      const receipt = await waitForTx(node, txHash, {
        timeout: 1,
        interval: 0.1,
        waitForStatus: TxStatus.CHECKPOINTED,
      });
      expect(receipt.status).toBe(TxStatus.CHECKPOINTED);
    });

    it('returns when receipt status exceeds requested status', async () => {
      const provenReceipt = new TxReceipt(
        txHash,
        TxStatus.PROVEN,
        TxExecutionResult.SUCCESS,
        undefined,
        undefined,
        undefined,
        BlockNumber(20),
      );
      node.getTxReceipt.mockResolvedValue(provenReceipt);

      // Request CHECKPOINTED, but receive PROVEN - should return immediately
      const receipt = await waitForTx(node, txHash, {
        timeout: 1,
        interval: 0.1,
        waitForStatus: TxStatus.CHECKPOINTED,
      });
      expect(receipt.status).toBe(TxStatus.PROVEN);
    });

    it('waits until receipt reaches requested status', async () => {
      const proposedReceipt = new TxReceipt(
        txHash,
        TxStatus.PROPOSED,
        TxExecutionResult.SUCCESS,
        undefined,
        undefined,
        undefined,
        BlockNumber(20),
      );
      const checkpointedReceipt = new TxReceipt(
        txHash,
        TxStatus.CHECKPOINTED,
        TxExecutionResult.SUCCESS,
        undefined,
        undefined,
        undefined,
        BlockNumber(20),
      );

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
      const proposedReceipt = new TxReceipt(
        txHash,
        TxStatus.PROPOSED,
        TxExecutionResult.SUCCESS,
        undefined,
        undefined,
        undefined,
        BlockNumber(20),
      );
      node.getTxReceipt.mockResolvedValue(proposedReceipt);

      // Request PROVEN but only get PROPOSED
      await expect(
        waitForTx(node, txHash, { timeout: 0.5, interval: 0.1, waitForStatus: TxStatus.PROVEN }),
      ).rejects.toThrow(/Timeout/);
    });

    it('defaults to CHECKPOINTED if waitForStatus is not specified', async () => {
      const checkpointedReceipt = new TxReceipt(
        txHash,
        TxStatus.CHECKPOINTED,
        TxExecutionResult.SUCCESS,
        undefined,
        undefined,
        undefined,
        BlockNumber(20),
      );
      node.getTxReceipt.mockResolvedValue(checkpointedReceipt);

      const receipt = await waitForTx(node, txHash, { timeout: 1, interval: 0.1 });
      expect(receipt.status).toBe(TxStatus.CHECKPOINTED);
    });
  });
});
