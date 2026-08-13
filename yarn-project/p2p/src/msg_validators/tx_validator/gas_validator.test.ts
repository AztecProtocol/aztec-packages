import {
  MAX_PROCESSABLE_L2_GAS,
  MAX_TX_DA_GAS,
  PRIVATE_TX_L2_GAS_OVERHEAD,
  PUBLIC_TX_L2_GAS_OVERHEAD,
  TX_DA_GAS_OVERHEAD,
} from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { Writeable } from '@aztec/foundation/types';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { computeFeePayerBalanceStorageSlot } from '@aztec/protocol-contracts/fee-juice';
import { FunctionSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { Gas, GasFees, GasSettings } from '@aztec/stdlib/gas';
import { mockTx } from '@aztec/stdlib/testing';
import type { PublicStateSource } from '@aztec/stdlib/trees';
import {
  TX_ERROR_GAS_LIMIT_TOO_HIGH,
  TX_ERROR_INSUFFICIENT_FEE_PAYER_BALANCE,
  TX_ERROR_INSUFFICIENT_FEE_PER_GAS,
  TX_ERROR_INSUFFICIENT_GAS_LIMIT,
  type Tx,
} from '@aztec/stdlib/tx';

import assert from 'assert';
import { type MockProxy, mock, mockFn } from 'jest-mock-extended';

import { GasLimitsValidator, GasTxValidator, MaxFeePerGasValidator } from './gas_validator.js';
import { patchNonRevertibleFn, patchRevertibleFn } from './test_utils.js';

const DEFAULT_GAS_LIMITS = new Gas(MAX_TX_DA_GAS, MAX_PROCESSABLE_L2_GAS);
const TEARDOWN_DA_GAS = 98_304;

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

describe('GasTxValidator', () => {
  // Vars for validator.
  let publicStateSource: MockProxy<PublicStateSource>;
  let feeJuiceAddress: AztecAddress;
  let gasFees: Writeable<GasFees>;
  // Vars for tx.
  let tx: Tx;
  let payer: AztecAddress;
  let expectedBalanceSlot: Fr;
  let feeLimit: bigint;

  beforeEach(async () => {
    publicStateSource = mock<PublicStateSource>({
      storageRead: mockFn().mockImplementation((_address: AztecAddress, _slot: Fr) => Fr.ZERO),
    });
    feeJuiceAddress = ProtocolContractAddress.FeeJuice;
    gasFees = new GasFees(11, 22);

    tx = await mockTx(1, { numberOfNonRevertiblePublicCallRequests: 2 });
    tx.data.feePayer = await AztecAddress.random();
    tx.data.constants.txContext.gasSettings = GasSettings.fallback({
      gasLimits: DEFAULT_GAS_LIMITS,
      maxFeesPerGas: gasFees.clone(),
    });
    payer = tx.data.feePayer;
    expectedBalanceSlot = await computeFeePayerBalanceStorageSlot(payer);
    feeLimit = tx.data.constants.txContext.gasSettings.getFeeLimit().toBigInt();
  });

  const mockBalance = (balance: bigint) => {
    publicStateSource.storageRead.mockImplementation((address, slot) =>
      Promise.resolve(address.equals(feeJuiceAddress) && slot.equals(expectedBalanceSlot) ? new Fr(balance) : Fr.ZERO),
    );
  };

  const validateTx = async (tx: Tx) => {
    const validator = new GasTxValidator(publicStateSource, feeJuiceAddress, gasFees);
    return await validator.validateTx(tx);
  };

  const expectValid = async (tx: Tx) => {
    await expect(validateTx(tx)).resolves.toEqual({ result: 'valid' });
  };

  const expectInvalid = async (tx: Tx, reason: string) => {
    const result = await validateTx(tx);
    expect(result.result).toEqual('invalid');
    expect((result as { reason: string[] }).reason[0]).toContain(reason);
  };

  it('allows fee paying txs if fee payer has enough balance', async () => {
    mockBalance(feeLimit);
    await expectValid(tx);
  });

  it('allows fee paying txs if fee payer claims enough balance during setup', async () => {
    mockBalance(feeLimit - 1n);
    const selector = await FunctionSelector.fromSignature('_increase_public_balance((Field),u128)');
    await patchNonRevertibleFn(tx, 0, {
      address: ProtocolContractAddress.FeeJuice,
      selector,
      args: [payer.toField(), new Fr(1n)],
      msgSender: ProtocolContractAddress.FeeJuice,
    });
    await expectValid(tx);
  });

  it('rejects txs if fee payer has not enough balance', async () => {
    mockBalance(feeLimit - 1n);
    await expectInvalid(tx, TX_ERROR_INSUFFICIENT_FEE_PAYER_BALANCE);
  });

  it('rejects txs if fee payer has zero balance', async () => {
    await expectInvalid(tx, TX_ERROR_INSUFFICIENT_FEE_PAYER_BALANCE);
  });

  it('rejects txs if fee payer claims balance outside setup', async () => {
    mockBalance(feeLimit - 1n);
    await patchRevertibleFn(tx, 0, {
      selector: await FunctionSelector.fromSignature('_increase_public_balance((Field),u128)'),
      args: [payer.toField(), new Fr(1n)],
    });
    await expectInvalid(tx, TX_ERROR_INSUFFICIENT_FEE_PAYER_BALANCE);
  });

  it('does not enforce gas-limit admission, which is owned by GasLimitsValidator', async () => {
    // Gas estimation submits limits above the per-tx protocol maximum (GasSettings.forEstimation); whether they
    // are admissible is decided by GasLimitsValidator wherever a factory includes it, never by fee enforcement.
    tx.data.constants.txContext.gasSettings = GasSettings.fallback({
      gasLimits: new Gas(MAX_TX_DA_GAS, MAX_PROCESSABLE_L2_GAS * 2),
      maxFeesPerGas: gasFees.clone(),
      teardownGasLimits: new Gas(TEARDOWN_DA_GAS, 1),
    });
    mockBalance(tx.data.constants.txContext.gasSettings.getFeeLimit().toBigInt());
    await expectValid(tx);
  });

  it('rejects txs with not enough fee per da gas', async () => {
    gasFees.feePerDaGas = gasFees.feePerDaGas + 1n;
    await expectInvalid(tx, TX_ERROR_INSUFFICIENT_FEE_PER_GAS);
  });

  it('rejects txs with not enough fee per l2 gas', async () => {
    gasFees.feePerL2Gas = gasFees.feePerL2Gas + 1n;
    await expectInvalid(tx, TX_ERROR_INSUFFICIENT_FEE_PER_GAS);
  });
});

describe('GasLimitsValidator', () => {
  let gasFees: GasFees;
  let tx: Tx;

  beforeEach(async () => {
    gasFees = new GasFees(11, 22);
    tx = await mockTx(1, { numberOfNonRevertiblePublicCallRequests: 2 });
    tx.data.constants.txContext.gasSettings = GasSettings.fallback({
      gasLimits: DEFAULT_GAS_LIMITS,
      maxFeesPerGas: gasFees.clone(),
    });
  });

  const expectValid = async (tx: Tx) => {
    await expect(new GasLimitsValidator<Tx>().validateTx(tx)).resolves.toEqual({ result: 'valid' });
  };

  const expectInvalid = async (tx: Tx, reason: string) => {
    const result = await new GasLimitsValidator<Tx>().validateTx(tx);
    expect(result.result).toEqual('invalid');
    expect((result as { reason: string[] }).reason[0]).toContain(reason);
  };

  it('accepts public tx at exactly the minimum gas limits', async () => {
    assert(!!tx.data.forPublic);
    tx.data.constants.txContext.gasSettings = GasSettings.fallback({
      gasLimits: new Gas(TX_DA_GAS_OVERHEAD, PUBLIC_TX_L2_GAS_OVERHEAD),
      maxFeesPerGas: gasFees.clone(),
    });
    await expectValid(tx);
  });

  it('accepts private tx at exactly the minimum gas limits', async () => {
    const privateTx = await makePrivateTx(gasFees);
    privateTx.data.constants.txContext.gasSettings = GasSettings.fallback({
      gasLimits: new Gas(TX_DA_GAS_OVERHEAD, PRIVATE_TX_L2_GAS_OVERHEAD),
      maxFeesPerGas: gasFees.clone(),
    });
    await expectValid(privateTx);
  });

  it('rejects public tx below the public L2 gas minimum', async () => {
    assert(!!tx.data.forPublic);
    tx.data.constants.txContext.gasSettings = GasSettings.fallback({
      gasLimits: new Gas(TX_DA_GAS_OVERHEAD, PUBLIC_TX_L2_GAS_OVERHEAD - 1),
      maxFeesPerGas: gasFees.clone(),
    });
    await expectInvalid(tx, TX_ERROR_INSUFFICIENT_GAS_LIMIT);
  });

  it('rejects private tx below the private L2 gas minimum', async () => {
    const privateTx = await makePrivateTx(gasFees);
    privateTx.data.constants.txContext.gasSettings = GasSettings.fallback({
      gasLimits: new Gas(TX_DA_GAS_OVERHEAD, PRIVATE_TX_L2_GAS_OVERHEAD - 1),
      maxFeesPerGas: gasFees.clone(),
    });
    await expectInvalid(privateTx, TX_ERROR_INSUFFICIENT_GAS_LIMIT);
  });

  it('rejects public tx at private L2 gas minimum (between the two thresholds)', async () => {
    assert(!!tx.data.forPublic);
    // PRIVATE_TX_L2_GAS_OVERHEAD is enough for a private tx but not for a public tx.
    tx.data.constants.txContext.gasSettings = GasSettings.fallback({
      gasLimits: new Gas(TX_DA_GAS_OVERHEAD, PRIVATE_TX_L2_GAS_OVERHEAD),
      maxFeesPerGas: gasFees.clone(),
    });
    await expectInvalid(tx, TX_ERROR_INSUFFICIENT_GAS_LIMIT);
  });

  it('rejects tx below DA gas minimum', async () => {
    tx.data.constants.txContext.gasSettings = GasSettings.fallback({
      gasLimits: new Gas(TX_DA_GAS_OVERHEAD - 1, PUBLIC_TX_L2_GAS_OVERHEAD),
      maxFeesPerGas: gasFees.clone(),
    });
    await expectInvalid(tx, TX_ERROR_INSUFFICIENT_GAS_LIMIT);
  });

  it('rejects tx below both DA and L2 gas minimums', async () => {
    tx.data.constants.txContext.gasSettings = GasSettings.fallback({
      gasLimits: new Gas(1, 1),
      maxFeesPerGas: gasFees.clone(),
    });
    await expectInvalid(tx, TX_ERROR_INSUFFICIENT_GAS_LIMIT);
  });

  it('rejects public tx if L2 gas limit is too high', async () => {
    tx.data.constants.txContext.gasSettings = GasSettings.fallback({
      gasLimits: new Gas(MAX_TX_DA_GAS, MAX_PROCESSABLE_L2_GAS + 1),
      maxFeesPerGas: gasFees.clone(),
      teardownGasLimits: new Gas(TEARDOWN_DA_GAS, 1),
    });
    await expectInvalid(tx, TX_ERROR_GAS_LIMIT_TOO_HIGH);
  });

  it('rejects private tx if L2 gas limit is too high', async () => {
    const privateTx = await makePrivateTx(gasFees);
    privateTx.data.constants.txContext.gasSettings = GasSettings.fallback({
      gasLimits: new Gas(MAX_TX_DA_GAS, MAX_PROCESSABLE_L2_GAS + 1),
      maxFeesPerGas: gasFees.clone(),
      teardownGasLimits: new Gas(TEARDOWN_DA_GAS, 1),
    });
    await expectInvalid(privateTx, TX_ERROR_GAS_LIMIT_TOO_HIGH);
  });

  describe('network admission limits (maxTxL2Gas, maxTxDAGas)', () => {
    it('rejects tx exceeding maxTxL2Gas', async () => {
      const maxTxL2Gas = 1_000_000;
      const validator = new GasLimitsValidator({ maxTxL2Gas });
      tx.data.constants.txContext.gasSettings = GasSettings.fallback({
        gasLimits: new Gas(MAX_TX_DA_GAS, maxTxL2Gas + 1),
        maxFeesPerGas: gasFees.clone(),
        teardownGasLimits: new Gas(TEARDOWN_DA_GAS, 1),
      });
      await expect(validator.validateTx(tx)).resolves.toEqual({
        result: 'invalid',
        reason: [expect.stringContaining(TX_ERROR_GAS_LIMIT_TOO_HIGH)],
      });
    });

    it('accepts tx at exactly maxTxL2Gas', async () => {
      const maxTxL2Gas = 1_000_000;
      const validator = new GasLimitsValidator({ maxTxL2Gas });
      tx.data.constants.txContext.gasSettings = GasSettings.fallback({
        gasLimits: new Gas(MAX_TX_DA_GAS, maxTxL2Gas),
        maxFeesPerGas: gasFees.clone(),
        teardownGasLimits: new Gas(TEARDOWN_DA_GAS, 1),
      });
      await expect(validator.validateTx(tx)).resolves.toEqual({ result: 'valid' });
    });

    it('clamps maxTxL2Gas to the per-tx protocol maximum', async () => {
      // Passing a higher network limit cannot raise the ceiling above MAX_PROCESSABLE_L2_GAS.
      const validator = new GasLimitsValidator({ maxTxL2Gas: MAX_PROCESSABLE_L2_GAS + 1_000 });
      tx.data.constants.txContext.gasSettings = GasSettings.fallback({
        gasLimits: new Gas(MAX_TX_DA_GAS, MAX_PROCESSABLE_L2_GAS + 1),
        maxFeesPerGas: gasFees.clone(),
        teardownGasLimits: new Gas(TEARDOWN_DA_GAS, 1),
      });
      await expect(validator.validateTx(tx)).resolves.toEqual({
        result: 'invalid',
        reason: [expect.stringContaining(TX_ERROR_GAS_LIMIT_TOO_HIGH)],
      });
    });

    it('falls back to MAX_PROCESSABLE_L2_GAS when no L2 limit is set', async () => {
      const validator = new GasLimitsValidator();
      tx.data.constants.txContext.gasSettings = GasSettings.fallback({
        gasLimits: new Gas(MAX_TX_DA_GAS, MAX_PROCESSABLE_L2_GAS + 1),
        maxFeesPerGas: gasFees.clone(),
        teardownGasLimits: new Gas(TEARDOWN_DA_GAS, 1),
      });
      await expect(validator.validateTx(tx)).resolves.toEqual({
        result: 'invalid',
        reason: [expect.stringContaining(TX_ERROR_GAS_LIMIT_TOO_HIGH)],
      });
    });

    it('rejects tx exceeding maxTxDAGas', async () => {
      const maxTxDAGas = 100_000;
      const validator = new GasLimitsValidator({ maxTxDAGas });
      tx.data.constants.txContext.gasSettings = GasSettings.fallback({
        gasLimits: new Gas(maxTxDAGas + 1, PUBLIC_TX_L2_GAS_OVERHEAD),
        maxFeesPerGas: gasFees.clone(),
        teardownGasLimits: new Gas(TEARDOWN_DA_GAS, 1),
      });
      await expect(validator.validateTx(tx)).resolves.toEqual({
        result: 'invalid',
        reason: [expect.stringContaining(TX_ERROR_GAS_LIMIT_TOO_HIGH)],
      });
    });

    it('accepts tx at exactly maxTxDAGas', async () => {
      const maxTxDAGas = 100_000;
      const validator = new GasLimitsValidator({ maxTxDAGas });
      tx.data.constants.txContext.gasSettings = GasSettings.fallback({
        gasLimits: new Gas(maxTxDAGas, PUBLIC_TX_L2_GAS_OVERHEAD),
        maxFeesPerGas: gasFees.clone(),
        teardownGasLimits: new Gas(TEARDOWN_DA_GAS, 1),
      });
      await expect(validator.validateTx(tx)).resolves.toEqual({ result: 'valid' });
    });

    it('caps DA at the max tx blob size when no DA limit is set', async () => {
      const validator = new GasLimitsValidator();
      tx.data.constants.txContext.gasSettings = GasSettings.fallback({
        gasLimits: new Gas(MAX_TX_DA_GAS + 1, PUBLIC_TX_L2_GAS_OVERHEAD),
        maxFeesPerGas: gasFees.clone(),
        teardownGasLimits: new Gas(TEARDOWN_DA_GAS, 1),
      });
      await expect(validator.validateTx(tx)).resolves.toEqual({
        result: 'invalid',
        reason: [expect.stringContaining(TX_ERROR_GAS_LIMIT_TOO_HIGH)],
      });
    });

    it('accepts a tx at exactly the max tx blob size DA limit when no DA limit is set', async () => {
      const validator = new GasLimitsValidator();
      tx.data.constants.txContext.gasSettings = GasSettings.fallback({
        gasLimits: new Gas(MAX_TX_DA_GAS, PUBLIC_TX_L2_GAS_OVERHEAD),
        maxFeesPerGas: gasFees.clone(),
        teardownGasLimits: new Gas(TEARDOWN_DA_GAS, 1),
      });
      await expect(validator.validateTx(tx)).resolves.toEqual({ result: 'valid' });
    });
  });
});

describe('MaxFeePerGasValidator', () => {
  it('accepts tx with sufficient max fees per gas', async () => {
    const gasFees = new GasFees(10, 20);
    const validator = new MaxFeePerGasValidator<Tx>(gasFees);
    const tx = await mockTx(1, { numberOfNonRevertiblePublicCallRequests: 2 });
    tx.data.constants.txContext.gasSettings = GasSettings.fallback({
      gasLimits: DEFAULT_GAS_LIMITS,
      maxFeesPerGas: new GasFees(10, 20),
    });
    await expect(validator.validateTx(tx)).resolves.toEqual({ result: 'valid' });
  });

  it('rejects tx with insufficient DA fee per gas', async () => {
    const gasFees = new GasFees(10, 20);
    const validator = new MaxFeePerGasValidator<Tx>(gasFees);
    const tx = await mockTx(1, { numberOfNonRevertiblePublicCallRequests: 2 });
    tx.data.constants.txContext.gasSettings = GasSettings.fallback({
      gasLimits: DEFAULT_GAS_LIMITS,
      maxFeesPerGas: new GasFees(9, 20),
    });
    await expect(validator.validateTx(tx)).resolves.toEqual({
      result: 'invalid',
      reason: [expect.stringContaining(TX_ERROR_INSUFFICIENT_FEE_PER_GAS)],
    });
  });

  it('rejects tx with insufficient L2 fee per gas', async () => {
    const gasFees = new GasFees(10, 20);
    const validator = new MaxFeePerGasValidator<Tx>(gasFees);
    const tx = await mockTx(1, { numberOfNonRevertiblePublicCallRequests: 2 });
    tx.data.constants.txContext.gasSettings = GasSettings.fallback({
      gasLimits: DEFAULT_GAS_LIMITS,
      maxFeesPerGas: new GasFees(10, 19),
    });
    await expect(validator.validateTx(tx)).resolves.toEqual({
      result: 'invalid',
      reason: [expect.stringContaining(TX_ERROR_INSUFFICIENT_FEE_PER_GAS)],
    });
  });
});
