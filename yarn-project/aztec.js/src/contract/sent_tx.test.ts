import { Fr } from '@aztec/foundation/fields';
import type { AztecNode, PXE } from '@aztec/stdlib/interfaces/client';
import { TxHash, type TxReceipt, TxStatus } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import { SentTx } from './sent_tx.js';

describe('SentTx', () => {
  let pxe: MockProxy<PXE>;
  let node: MockProxy<AztecNode>;
  let sentTx: SentTx;

  const txHashGetter = () => Promise.resolve(new TxHash(new Fr(1n)));

  beforeEach(() => {
    pxe = mock();
    node = mock();
  });

  describe('wait with PXE', () => {
    let txReceipt: TxReceipt;
    beforeEach(() => {
      txReceipt = { status: TxStatus.SUCCESS, blockNumber: 20 } as TxReceipt;
      pxe.getTxReceipt.mockResolvedValue(txReceipt);
      sentTx = new SentTx(pxe, txHashGetter);
    });

    it('throws if tx is dropped', async () => {
      pxe.getTxReceipt.mockResolvedValue({ ...txReceipt, status: TxStatus.DROPPED } as TxReceipt);
      await expect(sentTx.wait({ timeout: 1, interval: 0.4, ignoreDroppedReceiptsFor: 0 })).rejects.toThrow(/dropped/);
    });
  });

  describe('wait with node', () => {
    let txReceipt: TxReceipt;
    beforeEach(() => {
      txReceipt = { status: TxStatus.SUCCESS, blockNumber: 20 } as TxReceipt;
      node.getTxReceipt.mockResolvedValue(txReceipt);
      sentTx = new SentTx(node, txHashGetter);
    });

    it('throws if tx is dropped', async () => {
      node.getTxReceipt.mockResolvedValue({ ...txReceipt, status: TxStatus.DROPPED } as TxReceipt);
      await expect(sentTx.wait({ timeout: 1, interval: 0.4, ignoreDroppedReceiptsFor: 0 })).rejects.toThrow(/dropped/);
    });
  });

  describe('throw in txHashPromise', () => {
    const alwaysThrows = (): Promise<TxHash> => {
      return Promise.reject(new Error('test error'));
    };

    it('can be constructed even if txHashPromise throws', () => {
      const sentTx = new SentTx(pxe, alwaysThrows);
      expect(sentTx).toBeDefined();
    });

    it('throws if getTxHash is called', async () => {
      const sentTx = new SentTx(pxe, alwaysThrows);
      await expect(sentTx.getTxHash()).rejects.toThrow('test error');
    });

    it('throws every time getTxHash is called', async () => {
      const sentTx = new SentTx(pxe, alwaysThrows);
      await expect(sentTx.getTxHash()).rejects.toThrow('test error');
      await expect(sentTx.getTxHash()).rejects.toThrow('test error');
      await expect(sentTx.getTxHash()).rejects.toThrow('test error');
    });

    it('throws if getReceipt is called', async () => {
      const sentTx = new SentTx(pxe, alwaysThrows);
      await expect(sentTx.getReceipt()).rejects.toThrow('test error');
    });

    it('throws if wait is called', async () => {
      const sentTx = new SentTx(pxe, alwaysThrows);
      await expect(sentTx.wait()).rejects.toThrow('test error');
    });
  });
});
