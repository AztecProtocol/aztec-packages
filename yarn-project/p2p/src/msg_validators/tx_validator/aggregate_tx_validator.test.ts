import { type AnyTx, Tx, type TxHash, type TxValidator, mockTx } from '@aztec/circuit-types';

import { AggregateTxValidator } from './aggregate_tx_validator.js';

describe('AggregateTxValidator', () => {
  it('allows txs that pass all validation', async () => {
    const txs = [mockTx(0), mockTx(1), mockTx(2), mockTx(3), mockTx(4)];
    const agg = new AggregateTxValidator(
      new TxDenyList([txs[0].getTxHash(), txs[1].getTxHash()], []),
      new TxDenyList([txs[2].getTxHash(), txs[4].getTxHash()], []),
    );

    const validTxs = [txs[3]];
    const invalidTxs = [txs[0], txs[1], txs[2], txs[4]];
    const skippedTxs: AnyTx[] = [];
    await expect(agg.validateTxs(txs)).resolves.toEqual([validTxs, invalidTxs, skippedTxs]);
  });

  it('aggregate skipped txs ', async () => {
    const txs = [mockTx(0), mockTx(1), mockTx(2), mockTx(3), mockTx(4)];
    const agg = new AggregateTxValidator(
      new TxDenyList([txs[0].getTxHash()], []),
      new TxDenyList([], [txs[1].getTxHash(), txs[2].getTxHash()]),
      new TxDenyList([], [txs[4].getTxHash()]),
    );

    const validTxs = [txs[3]];
    const invalidTxs = [txs[0]];
    const skippedTxs = [txs[1], txs[2], txs[4]];
    await expect(agg.validateTxs(txs)).resolves.toEqual([validTxs, invalidTxs, skippedTxs]);
  });

  class TxDenyList implements TxValidator<AnyTx> {
    denyList: Set<string>;
    skippedList: Set<string>;
    constructor(deniedTxHashes: TxHash[], skippedTxHashes: TxHash[]) {
      this.denyList = new Set(deniedTxHashes.map(hash => hash.toString()));
      this.skippedList = new Set(skippedTxHashes.map(hash => hash.toString()));
    }

    validateTxs(txs: AnyTx[]): Promise<[AnyTx[], AnyTx[], AnyTx[] | undefined]> {
      const validTxs: AnyTx[] = [];
      const invalidTxs: AnyTx[] = [];
      const skippedTxs: AnyTx[] = [];
      txs.forEach(tx => {
        const txHash = Tx.getHash(tx).toString();
        if (this.skippedList.has(txHash)) {
          skippedTxs.push(tx);
        } else if (this.denyList.has(txHash)) {
          invalidTxs.push(tx);
        } else {
          validTxs.push(tx);
        }
      });
      return Promise.resolve([validTxs, invalidTxs, skippedTxs.length ? skippedTxs : undefined]);
    }

    validateTx(tx: AnyTx): Promise<boolean> {
      return Promise.resolve(this.denyList.has(Tx.getHash(tx).toString()));
    }
  }
});
