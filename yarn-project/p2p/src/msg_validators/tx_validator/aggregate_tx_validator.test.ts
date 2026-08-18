import { mockTx } from '@aztec/stdlib/testing';
import type { AnyTx, TxHash, TxValidationResult, TxValidator } from '@aztec/stdlib/tx';

import { AggregateTxValidator } from './aggregate_tx_validator.js';

describe('AggregateTxValidator', () => {
  it('allows txs that pass all validation', async () => {
    const txs = await Promise.all([mockTx(0), mockTx(1), mockTx(2), mockTx(3), mockTx(4)]);
    const agg = new AggregateTxValidator(
      new TxDenyList([txs[0].getTxHash(), txs[1].getTxHash(), txs[4].getTxHash()]),
      new TxDenyList([txs[2].getTxHash(), txs[4].getTxHash()]),
    );

    await expect(agg.validateTx(txs[0])).resolves.toEqual({ result: 'invalid', reason: ['Denied'] });
    await expect(agg.validateTx(txs[1])).resolves.toEqual({ result: 'invalid', reason: ['Denied'] });
    await expect(agg.validateTx(txs[2])).resolves.toEqual({ result: 'invalid', reason: ['Denied'] });
    await expect(agg.validateTx(txs[3])).resolves.toEqual({ result: 'valid' });
    await expect(agg.validateTx(txs[4])).resolves.toEqual({ result: 'invalid', reason: ['Denied', 'Denied'] });
  });

  describe('stoppingAtFirstFailure', () => {
    it('returns only the first failure and leaves the later validators unrun', async () => {
      const txs = await Promise.all([mockTx(0), mockTx(1)]);
      const second = new CountingTxDenyList([txs[0].getTxHash()]);
      const agg = AggregateTxValidator.stoppingAtFirstFailure(new TxDenyList([txs[0].getTxHash()]), second);

      await expect(agg.validateTx(txs[0])).resolves.toEqual({ result: 'invalid', reason: ['Denied'] });
      expect(second.calls).toEqual(0);

      await expect(agg.validateTx(txs[1])).resolves.toEqual({ result: 'valid' });
      expect(second.calls).toEqual(1);
    });
  });

  class TxDenyList implements TxValidator<AnyTx> {
    denyList: Set<string>;

    constructor(deniedTxHashes: TxHash[]) {
      this.denyList = new Set(deniedTxHashes.map(hash => hash.toString()));
    }

    validateTx(tx: AnyTx): Promise<TxValidationResult> {
      const txHash = 'txHash' in tx ? tx.txHash : tx.hash;
      if (this.denyList.has(txHash.toString())) {
        return Promise.resolve({ result: 'invalid', reason: ['Denied'] });
      }
      return Promise.resolve({ result: 'valid' });
    }
  }

  /** A deny list that records how many times it was consulted. */
  class CountingTxDenyList extends TxDenyList {
    public calls = 0;

    public override validateTx(tx: AnyTx): Promise<TxValidationResult> {
      this.calls++;
      return super.validateTx(tx);
    }
  }
});
