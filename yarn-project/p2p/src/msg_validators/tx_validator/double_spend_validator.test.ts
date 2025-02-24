import { type AnyTx } from '@aztec/circuit-types';
import { mockTx, mockTxForRollup } from '@aztec/circuit-types/testing';

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
    const badTx = await mockTxForRollup();
    badTx.data.forRollup!.end.nullifiers[1] = badTx.data.forRollup!.end.nullifiers[0];
    await expectInvalid(badTx, 'Duplicate nullifier in tx');
  });

  it('rejects duplicates in revertible data', async () => {
    const badTx = await mockTxForRollup();
    badTx.data.forRollup!.end.nullifiers[1] = badTx.data.forRollup!.end.nullifiers[0];
    await expectInvalid(badTx, 'Duplicate nullifier in tx');
  });

  it('rejects duplicates against history', async () => {
    const badTx = await mockTx(1, {
      numberOfNonRevertiblePublicCallRequests: 0,
      numberOfRevertiblePublicCallRequests: 0,
    });
    nullifierSource.nullifiersExist.mockResolvedValue([true]);
    await expectInvalid(badTx, 'Existing nullifier');
  });

  // If the tx has public calls, all merkle insertions will be performed by the AVM,
  // and the AVM will catch any duplicates. So we don't need to check during tx validation.
  it('accepts duplicates if the tx has public calls', async () => {
    const badTx = await mockTx(1, {
      numberOfNonRevertiblePublicCallRequests: 1,
      numberOfRevertiblePublicCallRequests: 1,
    });
    badTx.data.forPublic!.revertibleAccumulatedData.nullifiers[0] =
      badTx.data.forPublic!.nonRevertibleAccumulatedData.nullifiers[0];
    await expectValid(badTx);
  });
});
