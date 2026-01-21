import { Fr } from '@aztec/foundation/curves/bn254';
import { PrivateKernelTailCircuitPublicInputs } from '@aztec/stdlib/kernel';
import { ChonkProof } from '@aztec/stdlib/proofs';
import { mockTx } from '@aztec/stdlib/testing';
import { HashedValues, TX_ERROR_SIZE_ABOVE_LIMIT, Tx, TxHash } from '@aztec/stdlib/tx';

import { SizeTxValidator } from './size_validator.js';

describe('TxDataValidator', () => {
  let validator: SizeTxValidator;

  beforeEach(() => {
    validator = new SizeTxValidator();
  });

  it('allows transactions within the size limit', async () => {
    const tx = await mockTx(1);
    await expect(validator.validateTx(tx)).resolves.toEqual({ result: 'valid' });
  });

  it('rejects transactions outside the size limit', async () => {
    const tx = new Tx(
      TxHash.random(),
      PrivateKernelTailCircuitPublicInputs.empty(),
      ChonkProof.empty(),
      [],
      [new HashedValues(Array(100000).fill(Fr.random()), Fr.random())],
    );

    await expect(validator.validateTx(tx)).resolves.toEqual({
      result: 'invalid',
      reason: [TX_ERROR_SIZE_ABOVE_LIMIT],
    });
  });
});
