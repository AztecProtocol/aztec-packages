import { mockTx } from '@aztec/stdlib/testing';

import { TxPermittedValidator } from './tx_permitted_validator.js';

describe('TxPermittedValidator', () => {
  it('does not validate txs if they are not permitted', async () => {
    const validator = new TxPermittedValidator(false);
    const tx = await mockTx(1);
    expect(await validator.validateTx(tx)).toEqual({ result: 'invalid', reason: ['Transactions are not permitted'] });
  });

  it('does validate txs if they are permitted', async () => {
    const validator = new TxPermittedValidator(true);
    const tx = await mockTx(1);
    expect(await validator.validateTx(tx)).toEqual({ result: 'valid' });
  });
});
