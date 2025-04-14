import { mockTx, mockTxForRollup } from '@aztec/stdlib/testing';
import { type AnyTx, TX_ERROR_DUPLICATE_NULLIFIER_IN_TX, TX_ERROR_EXISTING_NULLIFIER } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import { DoubleSpendTxValidator, type NullifierSource } from './double_spend_validator.js';

describe('DoubleSpendTxValidator', () => {
  let txValidator: DoubleSpendTxValidator<AnyTx>;
  let nullifierSource: MockProxy<NullifierSource>;

  const expectValid = async (tx: AnyTx) => {
    await expect(txValidator.validateTx(tx)).resolves.toEqual({ result: 'valid' });
  };
  const expectInvalid = async (tx: AnyTx, reason: string) => {
    await expect(txValidator.validateTx(tx)).resolves.toEqual({ result: 'invalid', reason: [reason] });
  };

  beforeEach(() => {
    nullifierSource = mock<NullifierSource>();
    nullifierSource.nullifiersExist.mockResolvedValue([]);
    txValidator = new DoubleSpendTxValidator(nullifierSource);
  });

  it('rejects duplicates in non revertible data', async () => {
    const badTx = await mockTx(1, {
      numberOfNonRevertiblePublicCallRequests: 1,
      numberOfRevertiblePublicCallRequests: 0,
    });
    badTx.data.forPublic!.nonRevertibleAccumulatedData.nullifiers[1] =
      badTx.data.forPublic!.nonRevertibleAccumulatedData.nullifiers[0];
    await expectInvalid(badTx, TX_ERROR_DUPLICATE_NULLIFIER_IN_TX);
  });

  it('rejects duplicates in revertible data', async () => {
    const badTx = await mockTx(1, {
      numberOfNonRevertiblePublicCallRequests: 0,
      numberOfRevertiblePublicCallRequests: 1,
      numberOfRevertibleNullifiers: 1,
    });
    badTx.data.forPublic!.revertibleAccumulatedData.nullifiers[1] =
      badTx.data.forPublic!.revertibleAccumulatedData.nullifiers[0];
    await expectInvalid(badTx, TX_ERROR_DUPLICATE_NULLIFIER_IN_TX);
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
