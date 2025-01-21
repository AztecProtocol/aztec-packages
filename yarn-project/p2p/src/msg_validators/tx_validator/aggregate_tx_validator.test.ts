import { type AnyTx, Tx, type TxHash, type TxValidationResult, type TxValidator, mockTx } from '@aztec/circuit-types';

import { AggregateTxValidator } from './aggregate_tx_validator.js';

describe('AggregateTxValidator', () => {
  it('allows txs that pass all validation', async () => {
    const txs = [mockTx(0), mockTx(1), mockTx(2), mockTx(3), mockTx(4)];
    const agg = new AggregateTxValidator(
      new TxDenyList([txs[0].getTxHash(), txs[1].getTxHash(), txs[4].getTxHash()], []),
      new TxDenyList([txs[2].getTxHash(), txs[4].getTxHash()], []),
    );

    await expect(agg.validateTx(txs[0])).resolves.toEqual({ result: 'invalid', reason: ['Denied'] });
    await expect(agg.validateTx(txs[1])).resolves.toEqual({ result: 'invalid', reason: ['Denied'] });
    await expect(agg.validateTx(txs[2])).resolves.toEqual({ result: 'invalid', reason: ['Denied'] });
    await expect(agg.validateTx(txs[3])).resolves.toEqual({ result: 'valid' });
    await expect(agg.validateTx(txs[4])).resolves.toEqual({ result: 'invalid', reason: ['Denied', 'Denied'] });
  });

  it('aggregate skipped txs ', async () => {
    const txs = [mockTx(0), mockTx(1), mockTx(2), mockTx(3), mockTx(4)];
    const agg = new AggregateTxValidator(
      new TxDenyList([txs[0].getTxHash()], []),
      new TxDenyList([txs[4].getTxHash()], [txs[1].getTxHash(), txs[2].getTxHash()]),
      new TxDenyList([], [txs[4].getTxHash()]),
    );

    await expect(agg.validateTx(txs[0])).resolves.toEqual({ result: 'invalid', reason: ['Denied'] });
    await expect(agg.validateTx(txs[1])).resolves.toEqual({ result: 'skipped', reason: ['Skipped'] });
    await expect(agg.validateTx(txs[2])).resolves.toEqual({ result: 'skipped', reason: ['Skipped'] });
    await expect(agg.validateTx(txs[3])).resolves.toEqual({ result: 'valid' });
    await expect(agg.validateTx(txs[4])).resolves.toEqual({ result: 'invalid', reason: ['Denied', 'Skipped'] });
  });

  class TxDenyList implements TxValidator<AnyTx> {
    denyList: Set<string>;
    skippedList: Set<string>;

    constructor(deniedTxHashes: TxHash[], skippedTxHashes: TxHash[]) {
      this.denyList = new Set(deniedTxHashes.map(hash => hash.toString()));
      this.skippedList = new Set(skippedTxHashes.map(hash => hash.toString()));
    }

    validateTx(tx: AnyTx): Promise<TxValidationResult> {
      if (this.skippedList.has(Tx.getHash(tx).toString())) {
        return Promise.resolve({ result: 'skipped', reason: ['Skipped'] });
      }
      if (this.denyList.has(Tx.getHash(tx).toString())) {
        return Promise.resolve({ result: 'invalid', reason: ['Denied'] });
      }
      return Promise.resolve({ result: 'valid' });
    }
  }
});
