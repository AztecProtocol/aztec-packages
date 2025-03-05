import { Fr } from '@aztec/foundation/fields';
import type { AztecNode, PXE } from '@aztec/stdlib/interfaces/client';
import { TxHash, type TxReceipt, TxStatus } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import { SentTx } from './sent_tx.js';

describe('SentTx', () => {
  let pxe: MockProxy<PXE>;
  let node: MockProxy<AztecNode>;
  let txHashPromise: Promise<TxHash>;

  let sentTx: SentTx;

  beforeEach(() => {
    pxe = mock();
    node = mock();
    txHashPromise = Promise.resolve(new TxHash(new Fr(1n)));
  });

  describe('wait with PXE', () => {
    let txReceipt: TxReceipt;
    beforeEach(() => {
      txReceipt = { status: TxStatus.SUCCESS, blockNumber: 20 } as TxReceipt;
      pxe.getTxReceipt.mockResolvedValue(txReceipt);
      sentTx = new SentTx(pxe, txHashPromise);
    });

    it('throws if tx is dropped', async () => {
      pxe.getTxReceipt.mockResolvedValue({ ...txReceipt, status: TxStatus.DROPPED } as TxReceipt);
      await expect(sentTx.wait({ timeout: 1, interval: 0.4, ignoreDroppedReceiptsFor: 0 })).rejects.toThrow(/dropped/);
    });

    it('waits for the tx to be proven', async () => {
      const waitOpts = { timeout: 1, interval: 0.4, proven: true, provenTimeout: 2 };
      pxe.getProvenBlockNumber.mockResolvedValue(10);
      await expect(sentTx.wait(waitOpts)).rejects.toThrow(/timeout/i);

      pxe.getProvenBlockNumber.mockResolvedValue(20);
      const actual = await sentTx.wait(waitOpts);
      expect(actual).toEqual(txReceipt);
    });
  });

  describe('wait with node', () => {
    let txReceipt: TxReceipt;
    beforeEach(() => {
      txReceipt = { status: TxStatus.SUCCESS, blockNumber: 20 } as TxReceipt;
      node.getTxReceipt.mockResolvedValue(txReceipt);
      sentTx = new SentTx(node, txHashPromise);
    });

    it('throws if tx is dropped', async () => {
      node.getTxReceipt.mockResolvedValue({ ...txReceipt, status: TxStatus.DROPPED } as TxReceipt);
      await expect(sentTx.wait({ timeout: 1, interval: 0.4, ignoreDroppedReceiptsFor: 0 })).rejects.toThrow(/dropped/);
    });

    it('waits for the tx to be proven', async () => {
      const waitOpts = { timeout: 1, interval: 0.4, proven: true, provenTimeout: 2 };
      node.getProvenBlockNumber.mockResolvedValue(10);
      await expect(sentTx.wait(waitOpts)).rejects.toThrow(/timeout/i);

      node.getProvenBlockNumber.mockResolvedValue(20);
      const actual = await sentTx.wait(waitOpts);
      expect(actual).toEqual(txReceipt);
    });
  });
});
