import { BlockNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { TimeoutError } from '@aztec/foundation/error';
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

import { waitForNode, waitForTx } from './node.js';

describe('waitForTx', () => {
  let node: MockProxy<AztecNode>;
  let txHash: TxHash;

  const minedReceipt = (status: MinedTxStatus, executionResult = TxExecutionResult.SUCCESS): MinedTxReceipt =>
    new MinedTxReceipt(
      txHash,
      status,
      executionResult,
      1n,
      BlockHash.random(),
      BlockNumber(20),
      SlotNumber(20),
      0,
      EpochNumber(1),
      undefined,
    );

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
        .mockResolvedValueOnce(new PendingTxReceipt(txHash, undefined))
        .mockResolvedValueOnce(minedReceipt(TxStatus.CHECKPOINTED));
      const receipt = await waitForTx(node, txHash, { timeout: 1, interval: 0.1 });
      expect(receipt.status).toBe(TxStatus.CHECKPOINTED);
      expect(node.getTxReceipt).toHaveBeenCalledTimes(2);
    });

    it('keeps waiting after a transient RPC error', async () => {
      node.getTxReceipt
        .mockRejectedValueOnce(new Error('connection reset'))
        .mockResolvedValueOnce(minedReceipt(TxStatus.CHECKPOINTED));

      const receipt = await waitForTx(node, txHash, { timeout: 1, interval: 0.01 });

      expect(receipt.status).toBe(TxStatus.CHECKPOINTED);
    });
  });

  describe('initialDelay option', () => {
    it('delays the first receipt poll', async () => {
      const start = Date.now();
      let firstPollAt: number | undefined;
      node.getTxReceipt.mockImplementation(() => {
        firstPollAt ??= Date.now();
        return Promise.resolve(minedReceipt(TxStatus.CHECKPOINTED));
      });

      const receipt = await waitForTx(node, txHash, { timeout: 1, interval: 0.05, initialDelay: 0.2 });

      expect(receipt.status).toBe(TxStatus.CHECKPOINTED);
      expect(node.getTxReceipt).toHaveBeenCalledTimes(1);
      expect(firstPollAt! - start).toBeGreaterThanOrEqual(150);
    });

    it('does not consume the dropped-receipt grace period', async () => {
      node.getTxReceipt.mockResolvedValue(new DroppedTxReceipt(txHash, 'Tx dropped'));
      const start = Date.now();

      await expect(
        waitForTx(node, txHash, { timeout: 2, interval: 0.05, initialDelay: 0.3, ignoreDroppedReceiptsFor: 0.2 }),
      ).rejects.toThrow(/dropped/);

      expect(Date.now() - start).toBeGreaterThanOrEqual(450);
    });

    it('counts against the timeout', async () => {
      node.getTxReceipt.mockResolvedValue(new PendingTxReceipt(txHash, undefined));
      const start = Date.now();

      await expect(waitForTx(node, txHash, { timeout: 0.3, interval: 0.05, initialDelay: 1 })).rejects.toThrow(
        /Timeout/,
      );

      expect(Date.now() - start).toBeLessThan(1000);
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

describe('waitForNode', () => {
  let node: MockProxy<AztecNode>;

  beforeEach(() => {
    node = mock();
  });

  it('resolves once the node becomes reachable', async () => {
    node.getNodeInfo.mockRejectedValueOnce(new Error('not up yet')).mockResolvedValueOnce({} as any);

    await expect(waitForNode(node, undefined, { timeout: 5, interval: 0.01 })).resolves.toBeUndefined();
    expect(node.getNodeInfo).toHaveBeenCalledTimes(2);
  });

  it('rejects with a TimeoutError when the node stays unreachable', async () => {
    node.getNodeInfo.mockRejectedValue(new Error('unreachable'));

    await expect(waitForNode(node, undefined, { timeout: 0.05, interval: 0.01 })).rejects.toThrow(TimeoutError);
  });
});
