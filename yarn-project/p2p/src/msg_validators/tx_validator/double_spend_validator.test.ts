import { mockTx, mockTxForRollup } from '@aztec/stdlib/testing';
import { TX_ERROR_EXISTING_NULLIFIER, type Tx } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import { DoubleSpendTxValidator, type NullifierSource } from './double_spend_validator.js';

describe('DoubleSpendTxValidator', () => {
  let txValidator: DoubleSpendTxValidator<Tx>;
  let nullifierSource: MockProxy<NullifierSource>;

  const expectValid = async (tx: Tx) => {
    await expect(txValidator.validateTx(tx)).resolves.toEqual({ result: 'valid' });
  };
  const expectInvalid = async (tx: Tx, reason: string) => {
    await expect(txValidator.validateTx(tx)).resolves.toEqual({ result: 'invalid', reason: [reason] });
  };

  beforeEach(() => {
    nullifierSource = mock<NullifierSource>();
    nullifierSource.nullifiersExist.mockResolvedValue([]);
    txValidator = new DoubleSpendTxValidator(nullifierSource);
  });

  it('rejects duplicates against history', async () => {
    const badTx = await mockTx(1, {
      numberOfNonRevertiblePublicCallRequests: 0,
      numberOfRevertiblePublicCallRequests: 0,
    });
    nullifierSource.nullifiersExist.mockResolvedValue([true]);
    await expectInvalid(badTx, TX_ERROR_EXISTING_NULLIFIER);
  });

  it('accepts txs with no duplicates', async () => {
    const tx = await mockTxForRollup();
    await expectValid(tx);
  });
});
