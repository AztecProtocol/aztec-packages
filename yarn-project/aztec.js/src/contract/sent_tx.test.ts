import { type PXE, TxHash, type TxReceipt, TxStatus } from '@aztec/circuit-types';

import { type MockProxy, mock } from 'jest-mock-extended';

import { SentTx } from './sent_tx.js';

describe('SentTx', () => {
  let pxe: MockProxy<PXE>;
  let txHashPromise: Promise<TxHash>;

  let sentTx: SentTx;

  beforeEach(() => {
    pxe = mock();
    txHashPromise = Promise.resolve(TxHash.fromBigInt(1n));
    sentTx = new SentTx(pxe, txHashPromise);
  });

  describe('wait', () => {
    let txReceipt: TxReceipt;
    beforeEach(() => {
      txReceipt = { status: TxStatus.SUCCESS, blockNumber: 20 } as TxReceipt;
      pxe.getTxReceipt.mockResolvedValue(txReceipt);
    });

    it('waits for all notes of the accounts to be available', async () => {
      pxe.getSyncStatus.mockResolvedValueOnce({ blocks: 25 }).mockResolvedValueOnce({ blocks: 25 });

      const actual = await sentTx.wait({ timeout: 1, interval: 0.4 });
      expect(actual).toEqual(txReceipt);
    });

    it('does not wait for notes sync', async () => {
      pxe.getSyncStatus.mockResolvedValue({ blocks: 19 });
      const actual = await sentTx.wait({ timeout: 1, interval: 0.4, waitForNotesAvailable: false });
      expect(actual).toEqual(txReceipt);
    });

    it('throws if tx is dropped', async () => {
      pxe.getTxReceipt.mockResolvedValue({ ...txReceipt, status: TxStatus.DROPPED } as TxReceipt);
      pxe.getSyncStatus.mockResolvedValue({ blocks: 19 });
      await expect(sentTx.wait({ timeout: 1, interval: 0.4, ignoreDroppedReceiptsFor: 0 })).rejects.toThrow(/dropped/);
    });

    it('waits for the tx to be proven', async () => {
      const waitOpts = { timeout: 1, interval: 0.4, waitForNotesAvailable: false, proven: true, provenTimeout: 2 };
      pxe.getProvenBlockNumber.mockResolvedValue(10);
      await expect(sentTx.wait(waitOpts)).rejects.toThrow(/timeout/i);

      pxe.getProvenBlockNumber.mockResolvedValue(20);
      const actual = await sentTx.wait(waitOpts);
      expect(actual).toEqual(txReceipt);
    });
  });
});
