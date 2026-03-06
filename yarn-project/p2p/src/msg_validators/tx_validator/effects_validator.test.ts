import { Fr } from '@aztec/foundation/curves/bn254';
import { mockTx } from '@aztec/stdlib/testing';
import { TX_ERROR_DUPLICATE_NULLIFIER_IN_TX, type Tx } from '@aztec/stdlib/tx';

import { EffectsTxValidator } from './effects_validator.js';

describe('EffectsTxValidator', () => {
  let validator: EffectsTxValidator;

  beforeEach(() => {
    validator = new EffectsTxValidator();
  });

  const expectValid = async (tx: Tx) => {
    await tx.recomputeHash();
    await expect(validator.validateTx(tx)).resolves.toEqual({ result: 'valid' });
  };

  const expectInvalid = async (tx: Tx, reason: string) => {
    await tx.recomputeHash();
    await expect(validator.validateTx(tx)).resolves.toEqual({ result: 'invalid', reason: [reason] });
  };

  describe('forPublic txs (only non-revertible nullifiers are checked)', () => {
    it('rejects txs with duplicate nullifiers in non-revertible data', async () => {
      const badTx = await mockTx(1, {
        numberOfNonRevertiblePublicCallRequests: 1,
        numberOfRevertiblePublicCallRequests: 0,
      });
      const nullifiers = badTx.data.forPublic!.nonRevertibleAccumulatedData.nullifiers;
      nullifiers[1] = new Fr(nullifiers[0].toBigInt());
      await expectInvalid(badTx, TX_ERROR_DUPLICATE_NULLIFIER_IN_TX);
    });

    it('allows txs with duplicate nullifiers in revertible data', async () => {
      const tx = await mockTx(1, {
        numberOfNonRevertiblePublicCallRequests: 0,
        numberOfRevertiblePublicCallRequests: 1,
        numberOfRevertibleNullifiers: 2,
      });
      const nullifiers = tx.data.forPublic!.revertibleAccumulatedData.nullifiers;
      nullifiers[1] = new Fr(nullifiers[0].toBigInt());
      await expectValid(tx);
    });

    it('allows valid forPublic txs', async () => {
      const tx = await mockTx(1, {
        numberOfNonRevertiblePublicCallRequests: 2,
        numberOfRevertiblePublicCallRequests: 2,
      });
      await expectValid(tx);
    });
  });

  describe('forPrivate txs (all nullifiers are checked)', () => {
    it('rejects txs with duplicate nullifiers', async () => {
      const badTx = await mockTx(1, {
        numberOfNonRevertiblePublicCallRequests: 0,
        numberOfRevertiblePublicCallRequests: 0,
      });
      // forPrivate tx uses forRollup, nullifiers are in end.nullifiers
      const nullifiers = badTx.data.forRollup!.end.nullifiers;
      nullifiers[1] = new Fr(nullifiers[0].toBigInt());
      await expectInvalid(badTx, TX_ERROR_DUPLICATE_NULLIFIER_IN_TX);
    });

    it('allows valid forPrivate txs', async () => {
      const tx = await mockTx(1, {
        numberOfNonRevertiblePublicCallRequests: 0,
        numberOfRevertiblePublicCallRequests: 0,
      });
      await expectValid(tx);
    });
  });
});
