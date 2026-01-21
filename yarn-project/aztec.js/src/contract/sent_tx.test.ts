import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { TxExecutionResult, TxHash, TxReceipt, TxStatus } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import type { Wallet } from '../wallet/index.js';
import { SentTx } from './sent_tx.js';

describe('SentTx', () => {
  let wallet: MockProxy<Wallet>;
  let node: MockProxy<AztecNode>;
  let sentTx: SentTx;

  const txHashGetter = () => Promise.resolve(new TxHash(new Fr(1n)));

  beforeEach(() => {
    wallet = mock();
    node = mock();
  });

  describe('wait with Wallet', () => {
    let txReceipt: TxReceipt;
    beforeEach(() => {
      txReceipt = new TxReceipt(
        TxHash.random(),
        TxStatus.CHECKPOINTED,
        TxExecutionResult.SUCCESS,
        undefined,
        undefined,
        undefined,
        BlockNumber(20),
      );
      wallet.getTxReceipt.mockResolvedValue(txReceipt);
      sentTx = new SentTx(wallet, txHashGetter);
    });

    it('throws if tx is dropped', async () => {
      const droppedReceipt = new TxReceipt(TxHash.random(), TxStatus.DROPPED, undefined, 'Tx dropped');
      wallet.getTxReceipt.mockResolvedValue(droppedReceipt);
      await expect(sentTx.wait({ timeout: 1, interval: 0.4, ignoreDroppedReceiptsFor: 0 })).rejects.toThrow(/dropped/);
    });

    it('throws if tx reverts and dontThrowOnRevert is false', async () => {
      const revertedReceipt = new TxReceipt(
        TxHash.random(),
        TxStatus.CHECKPOINTED,
        TxExecutionResult.APP_LOGIC_REVERTED,
        undefined,
        undefined,
        undefined,
        BlockNumber(20),
      );
      wallet.getTxReceipt.mockResolvedValue(revertedReceipt);
      await expect(sentTx.wait({ timeout: 1, interval: 0.4 })).rejects.toThrow(/reverted/);
    });

    it('does not throw if tx reverts and dontThrowOnRevert is true', async () => {
      const revertedReceipt = new TxReceipt(
        TxHash.random(),
        TxStatus.CHECKPOINTED,
        TxExecutionResult.APP_LOGIC_REVERTED,
        undefined,
        undefined,
        undefined,
        BlockNumber(20),
      );
      wallet.getTxReceipt.mockResolvedValue(revertedReceipt);
      const receipt = await sentTx.wait({ timeout: 1, interval: 0.4, dontThrowOnRevert: true });
      expect(receipt.hasExecutionReverted()).toBe(true);
    });
  });

  describe('wait with Aztec Node', () => {
    let txReceipt: TxReceipt;
    beforeEach(() => {
      txReceipt = new TxReceipt(
        TxHash.random(),
        TxStatus.CHECKPOINTED,
        TxExecutionResult.SUCCESS,
        undefined,
        undefined,
        undefined,
        BlockNumber(20),
      );
      node.getTxReceipt.mockResolvedValue(txReceipt);
      sentTx = new SentTx(node, txHashGetter);
    });

    it('throws if tx is dropped', async () => {
      const droppedReceipt = new TxReceipt(TxHash.random(), TxStatus.DROPPED, undefined, 'Tx dropped');
      node.getTxReceipt.mockResolvedValue(droppedReceipt);
      await expect(sentTx.wait({ timeout: 1, interval: 0.4, ignoreDroppedReceiptsFor: 0 })).rejects.toThrow(/dropped/);
    });
  });

  describe('waitForStatus option', () => {
    beforeEach(() => {
      sentTx = new SentTx(wallet, txHashGetter);
    });

    it('returns immediately when receipt status matches requested status', async () => {
      const checkpointedReceipt = new TxReceipt(
        TxHash.random(),
        TxStatus.CHECKPOINTED,
        TxExecutionResult.SUCCESS,
        undefined,
        undefined,
        undefined,
        BlockNumber(20),
      );
      wallet.getTxReceipt.mockResolvedValue(checkpointedReceipt);

      const receipt = await sentTx.wait({ timeout: 1, interval: 0.1, waitForStatus: TxStatus.CHECKPOINTED });
      expect(receipt.status).toBe(TxStatus.CHECKPOINTED);
    });

    it('returns when receipt status exceeds requested status', async () => {
      const provenReceipt = new TxReceipt(
        TxHash.random(),
        TxStatus.PROVEN,
        TxExecutionResult.SUCCESS,
        undefined,
        undefined,
        undefined,
        BlockNumber(20),
      );
      wallet.getTxReceipt.mockResolvedValue(provenReceipt);

      // Request CHECKPOINTED, but receive PROVEN - should return immediately
      const receipt = await sentTx.wait({ timeout: 1, interval: 0.1, waitForStatus: TxStatus.CHECKPOINTED });
      expect(receipt.status).toBe(TxStatus.PROVEN);
    });

    it('waits until receipt reaches requested status', async () => {
      const proposedReceipt = new TxReceipt(
        TxHash.random(),
        TxStatus.PROPOSED,
        TxExecutionResult.SUCCESS,
        undefined,
        undefined,
        undefined,
        BlockNumber(20),
      );
      const checkpointedReceipt = new TxReceipt(
        TxHash.random(),
        TxStatus.CHECKPOINTED,
        TxExecutionResult.SUCCESS,
        undefined,
        undefined,
        undefined,
        BlockNumber(20),
      );

      // First call returns PROPOSED, second returns CHECKPOINTED
      wallet.getTxReceipt
        .mockResolvedValueOnce(proposedReceipt)
        .mockResolvedValueOnce(proposedReceipt)
        .mockResolvedValueOnce(checkpointedReceipt);

      const receipt = await sentTx.wait({ timeout: 2, interval: 0.1, waitForStatus: TxStatus.CHECKPOINTED });
      expect(receipt.status).toBe(TxStatus.CHECKPOINTED);
      expect(wallet.getTxReceipt).toHaveBeenCalledTimes(3);
    });

    it('times out if receipt never reaches requested status', async () => {
      const proposedReceipt = new TxReceipt(
        TxHash.random(),
        TxStatus.PROPOSED,
        TxExecutionResult.SUCCESS,
        undefined,
        undefined,
        undefined,
        BlockNumber(20),
      );
      wallet.getTxReceipt.mockResolvedValue(proposedReceipt);

      // Request PROVEN but only get PROPOSED
      await expect(sentTx.wait({ timeout: 0.5, interval: 0.1, waitForStatus: TxStatus.PROVEN })).rejects.toThrow(
        /Timeout/,
      );
    });

    it('defaults to CHECKPOINTED if waitForStatus is not specified', async () => {
      const checkpointedReceipt = new TxReceipt(
        TxHash.random(),
        TxStatus.CHECKPOINTED,
        TxExecutionResult.SUCCESS,
        undefined,
        undefined,
        undefined,
        BlockNumber(20),
      );
      wallet.getTxReceipt.mockResolvedValue(checkpointedReceipt);

      const receipt = await sentTx.wait({ timeout: 1, interval: 0.1 });
      expect(receipt.status).toBe(TxStatus.CHECKPOINTED);
    });
  });

  describe('throw in txHashPromise', () => {
    const alwaysThrows = (): Promise<TxHash> => {
      return Promise.reject(new Error('test error'));
    };

    it('can be constructed even if txHashPromise throws', () => {
      const sentTx = new SentTx(wallet, alwaysThrows);
      expect(sentTx).toBeDefined();
    });

    it('throws if getTxHash is called', async () => {
      const sentTx = new SentTx(wallet, alwaysThrows);
      await expect(sentTx.getTxHash()).rejects.toThrow('test error');
    });

    it('throws every time getTxHash is called', async () => {
      const sentTx = new SentTx(wallet, alwaysThrows);
      await expect(sentTx.getTxHash()).rejects.toThrow('test error');
      await expect(sentTx.getTxHash()).rejects.toThrow('test error');
      await expect(sentTx.getTxHash()).rejects.toThrow('test error');
    });

    it('throws if getReceipt is called', async () => {
      const sentTx = new SentTx(wallet, alwaysThrows);
      await expect(sentTx.getReceipt()).rejects.toThrow('test error');
    });

    it('throws if wait is called', async () => {
      const sentTx = new SentTx(wallet, alwaysThrows);
      await expect(sentTx.wait()).rejects.toThrow('test error');
    });
  });
});
