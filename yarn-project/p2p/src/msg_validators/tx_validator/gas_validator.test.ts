import { MAX_PROCESSABLE_L2_GAS, MAX_TX_DA_GAS } from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { Writeable } from '@aztec/foundation/types';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { computeFeePayerBalanceStorageSlot } from '@aztec/protocol-contracts/fee-juice';
import { FunctionSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { Gas, GasFees, GasSettings } from '@aztec/stdlib/gas';
import { mockTx } from '@aztec/stdlib/testing';
import type { PublicStateSource } from '@aztec/stdlib/trees';
import { TX_ERROR_INSUFFICIENT_FEE_PAYER_BALANCE, TX_ERROR_INSUFFICIENT_FEE_PER_GAS, type Tx } from '@aztec/stdlib/tx';

import { type MockProxy, mock, mockFn } from 'jest-mock-extended';

import { GasTxValidator, MaxFeePerGasValidator } from './gas_validator.js';
import { patchNonRevertibleFn, patchRevertibleFn } from './test_utils.js';

const DEFAULT_GAS_LIMITS = new Gas(MAX_TX_DA_GAS, MAX_PROCESSABLE_L2_GAS);
const TEARDOWN_DA_GAS = 98_304;

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

  it('does not enforce gas limits, which are owned by the gas limits validators', async () => {
    // Gas estimation submits limits above the per-tx protocol maximum (GasSettings.forEstimation); whether they
    // are admissible is decided by MinGasLimitsValidator/MaxGasLimitsValidator wherever a factory includes them,
    // never by fee enforcement.
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
