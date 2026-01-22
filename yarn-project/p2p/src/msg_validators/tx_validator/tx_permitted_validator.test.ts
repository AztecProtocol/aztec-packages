import { createLogger } from '@aztec/foundation/log';
import { mockTx } from '@aztec/stdlib/testing';

import { TxPermittedValidator } from './tx_permitted_validator.js';

describe('TxPermittedValidator', () => {
  const logger = createLogger('p2p:test:tx-permitted-validator');

  test.each([
    {
      permitted: false,
      expected: { result: 'invalid', reason: ['Transactions are not permitted'] },
      description: 'does not accept txs if they are not permitted',
    },
    {
      permitted: true,
      expected: { result: 'valid' },
      description: 'does accept txs if they are permitted',
    },
  ])('$description', async ({ permitted, expected }) => {
    const validator = new TxPermittedValidator(permitted, logger);
    const tx = await mockTx(1);
    expect(await validator.validateTx(tx)).toEqual(expected);
  });
});
