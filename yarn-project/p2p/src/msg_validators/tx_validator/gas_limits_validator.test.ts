import {
  MAX_PROCESSABLE_L2_GAS,
  MAX_TX_DA_GAS,
  PRIVATE_TX_L2_GAS_OVERHEAD,
  PUBLIC_TX_L2_GAS_OVERHEAD,
  TX_DA_GAS_OVERHEAD,
} from '@aztec/constants';
import { Gas, GasFees, GasSettings } from '@aztec/stdlib/gas';
import { mockTx } from '@aztec/stdlib/testing';
import { TX_ERROR_GAS_LIMIT_TOO_HIGH, TX_ERROR_INSUFFICIENT_GAS_LIMIT, type Tx } from '@aztec/stdlib/tx';

import assert from 'assert';

import { MaxGasLimitsValidator, MinGasLimitsValidator } from './gas_limits_validator.js';

const DEFAULT_GAS_LIMITS = new Gas(MAX_TX_DA_GAS, MAX_PROCESSABLE_L2_GAS);

/** A tx with no public calls, carrying the default gas limits. */
const makePrivateTx = async (gasFees: GasFees) => {
  const privateTx = await mockTx(1, {
    numberOfNonRevertiblePublicCallRequests: 0,
    numberOfRevertiblePublicCallRequests: 0,
    hasPublicTeardownCallRequest: false,
  });
  assert(!privateTx.data.forPublic);
  privateTx.data.constants.txContext.gasSettings = GasSettings.fallback({
    gasLimits: DEFAULT_GAS_LIMITS,
    maxFeesPerGas: gasFees.clone(),
  });
  return privateTx;
};

describe('gas limits validators', () => {
  let gasFees: GasFees;
  let tx: Tx;

  const setGasLimits = (tx: Tx, gasLimits: Gas) => {
    tx.data.constants.txContext.gasSettings = GasSettings.fallback({ gasLimits, maxFeesPerGas: gasFees.clone() });
  };

  beforeEach(async () => {
    gasFees = new GasFees(11, 22);
    tx = await mockTx(1, { numberOfNonRevertiblePublicCallRequests: 2 });
    setGasLimits(tx, DEFAULT_GAS_LIMITS);
  });

  describe('MinGasLimitsValidator', () => {
    const expectValid = async (tx: Tx) => {
      await expect(new MinGasLimitsValidator<Tx>().validateTx(tx)).resolves.toEqual({ result: 'valid' });
    };

    const expectInvalid = async (tx: Tx) => {
      const result = await new MinGasLimitsValidator<Tx>().validateTx(tx);
      expect(result.result).toEqual('invalid');
      expect((result as { reason: string[] }).reason[0]).toContain(TX_ERROR_INSUFFICIENT_GAS_LIMIT);
    };

    it('accepts public tx at exactly the minimum gas limits', async () => {
      assert(!!tx.data.forPublic);
      setGasLimits(tx, new Gas(TX_DA_GAS_OVERHEAD, PUBLIC_TX_L2_GAS_OVERHEAD));
      await expectValid(tx);
    });

    it('accepts private tx at exactly the minimum gas limits', async () => {
      const privateTx = await makePrivateTx(gasFees);
      setGasLimits(privateTx, new Gas(TX_DA_GAS_OVERHEAD, PRIVATE_TX_L2_GAS_OVERHEAD));
      await expectValid(privateTx);
    });

    it('rejects public tx below the public L2 gas minimum', async () => {
      assert(!!tx.data.forPublic);
      setGasLimits(tx, new Gas(TX_DA_GAS_OVERHEAD, PUBLIC_TX_L2_GAS_OVERHEAD - 1));
      await expectInvalid(tx);
    });

    it('rejects private tx below the private L2 gas minimum', async () => {
      const privateTx = await makePrivateTx(gasFees);
      setGasLimits(privateTx, new Gas(TX_DA_GAS_OVERHEAD, PRIVATE_TX_L2_GAS_OVERHEAD - 1));
      await expectInvalid(privateTx);
    });

    it('rejects public tx at private L2 gas minimum (between the two thresholds)', async () => {
      assert(!!tx.data.forPublic);
      // PRIVATE_TX_L2_GAS_OVERHEAD is enough for a private tx but not for a public tx.
      setGasLimits(tx, new Gas(TX_DA_GAS_OVERHEAD, PRIVATE_TX_L2_GAS_OVERHEAD));
      await expectInvalid(tx);
    });

    it('rejects tx below DA gas minimum', async () => {
      setGasLimits(tx, new Gas(TX_DA_GAS_OVERHEAD - 1, PUBLIC_TX_L2_GAS_OVERHEAD));
      await expectInvalid(tx);
    });

    it('rejects tx below both DA and L2 gas minimums', async () => {
      setGasLimits(tx, new Gas(TX_DA_GAS_OVERHEAD - 1, PUBLIC_TX_L2_GAS_OVERHEAD - 1));
      await expectInvalid(tx);
    });

    it('ignores limits above the protocol ceiling', async () => {
      // The ceiling is owned by MaxGasLimitsValidator, which factories include separately so that the
      // estimation exemption cannot take the floor with it.
      setGasLimits(tx, new Gas(MAX_TX_DA_GAS + 1, MAX_PROCESSABLE_L2_GAS + 1));
      await expectValid(tx);
    });
  });

  describe('MaxGasLimitsValidator', () => {
    const expectValid = async (tx: Tx, validator = new MaxGasLimitsValidator<Tx>()) => {
      await expect(validator.validateTx(tx)).resolves.toEqual({ result: 'valid' });
    };

    const expectInvalid = async (tx: Tx, validator = new MaxGasLimitsValidator<Tx>()) => {
      await expect(validator.validateTx(tx)).resolves.toEqual({
        result: 'invalid',
        reason: [expect.stringContaining(TX_ERROR_GAS_LIMIT_TOO_HIGH)],
      });
    };

    it('rejects public tx if L2 gas limit is too high', async () => {
      setGasLimits(tx, new Gas(MAX_TX_DA_GAS, MAX_PROCESSABLE_L2_GAS + 1));
      await expectInvalid(tx);
    });

    it('rejects private tx if L2 gas limit is too high', async () => {
      const privateTx = await makePrivateTx(gasFees);
      setGasLimits(privateTx, new Gas(MAX_TX_DA_GAS, MAX_PROCESSABLE_L2_GAS + 1));
      await expectInvalid(privateTx);
    });

    it('ignores limits below the protocol minimums', async () => {
      // The floor is owned by MinGasLimitsValidator.
      setGasLimits(tx, Gas.empty());
      await expectValid(tx);
    });

    describe('network admission limits (maxTxL2Gas, maxTxDAGas)', () => {
      it('rejects tx exceeding maxTxL2Gas', async () => {
        const maxTxL2Gas = 1_000_000;
        setGasLimits(tx, new Gas(MAX_TX_DA_GAS, maxTxL2Gas + 1));
        await expectInvalid(tx, new MaxGasLimitsValidator({ maxTxL2Gas }));
      });

      it('accepts tx at exactly maxTxL2Gas', async () => {
        const maxTxL2Gas = 1_000_000;
        setGasLimits(tx, new Gas(MAX_TX_DA_GAS, maxTxL2Gas));
        await expectValid(tx, new MaxGasLimitsValidator({ maxTxL2Gas }));
      });

      it('clamps maxTxL2Gas to the per-tx protocol maximum', async () => {
        // Passing a higher network limit cannot raise the ceiling above MAX_PROCESSABLE_L2_GAS.
        setGasLimits(tx, new Gas(MAX_TX_DA_GAS, MAX_PROCESSABLE_L2_GAS + 1));
        await expectInvalid(tx, new MaxGasLimitsValidator({ maxTxL2Gas: MAX_PROCESSABLE_L2_GAS + 1_000 }));
      });

      it('falls back to MAX_PROCESSABLE_L2_GAS when no L2 limit is set', async () => {
        setGasLimits(tx, new Gas(MAX_TX_DA_GAS, MAX_PROCESSABLE_L2_GAS + 1));
        await expectInvalid(tx);
      });

      it('rejects tx exceeding maxTxDAGas', async () => {
        const maxTxDAGas = 100_000;
        setGasLimits(tx, new Gas(maxTxDAGas + 1, PUBLIC_TX_L2_GAS_OVERHEAD));
        await expectInvalid(tx, new MaxGasLimitsValidator({ maxTxDAGas }));
      });

      it('accepts tx at exactly maxTxDAGas', async () => {
        const maxTxDAGas = 100_000;
        setGasLimits(tx, new Gas(maxTxDAGas, PUBLIC_TX_L2_GAS_OVERHEAD));
        await expectValid(tx, new MaxGasLimitsValidator({ maxTxDAGas }));
      });

      it('caps DA at the max tx blob size when no DA limit is set', async () => {
        setGasLimits(tx, new Gas(MAX_TX_DA_GAS + 1, PUBLIC_TX_L2_GAS_OVERHEAD));
        await expectInvalid(tx);
      });

      it('accepts a tx at exactly the max tx blob size DA limit when no DA limit is set', async () => {
        setGasLimits(tx, new Gas(MAX_TX_DA_GAS, PUBLIC_TX_L2_GAS_OVERHEAD));
        await expectValid(tx);
      });
    });
  });
});
