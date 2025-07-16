import { FIXED_DA_GAS, FIXED_L2_GAS } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import type { Writeable } from '@aztec/foundation/types';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { computeFeePayerBalanceStorageSlot } from '@aztec/protocol-contracts/fee-juice';
import { FunctionSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { Gas, GasFees, GasSettings } from '@aztec/stdlib/gas';
import { mockTx } from '@aztec/stdlib/testing';
import type { PublicStateSource } from '@aztec/stdlib/trees';
import {
  TX_ERROR_INSUFFICIENT_FEE_PAYER_BALANCE,
  TX_ERROR_INSUFFICIENT_FEE_PER_GAS,
  TX_ERROR_INSUFFICIENT_GAS_LIMIT,
  type Tx,
} from '@aztec/stdlib/tx';

import { type MockProxy, mock, mockFn } from 'jest-mock-extended';

import { GasTxValidator } from './gas_validator.js';
import { patchNonRevertibleFn, patchRevertibleFn } from './test_utils.js';

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
    tx.data.constants.txContext.gasSettings = GasSettings.default({ maxFeesPerGas: gasFees.clone() });
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
    await expect(validateTx(tx)).resolves.toEqual({ result: 'invalid', reason: [reason] });
  };

  const expectSkipped = async (tx: Tx, reason: string) => {
    await expect(validateTx(tx)).resolves.toEqual({ result: 'skipped', reason: [reason] });
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

  it('rejects txs if the DA gas limit is not above the minimum amount', async () => {
    tx.data.constants.txContext.gasSettings = GasSettings.default({
      gasLimits: new Gas(1, FIXED_L2_GAS),
      maxFeesPerGas: gasFees.clone(),
    });
    await expectInvalid(tx, TX_ERROR_INSUFFICIENT_GAS_LIMIT);
  });

  it('rejects txs if the L2 gas limit is not above the minimum amount', async () => {
    tx.data.constants.txContext.gasSettings = GasSettings.default({
      gasLimits: new Gas(FIXED_DA_GAS, 1),
      maxFeesPerGas: gasFees.clone(),
    });
    await expectInvalid(tx, TX_ERROR_INSUFFICIENT_GAS_LIMIT);
  });

  it('rejects txs if the DA and L2 gas limits are not above the minimum amount', async () => {
    tx.data.constants.txContext.gasSettings = GasSettings.default({
      gasLimits: new Gas(1, 1),
      maxFeesPerGas: gasFees.clone(),
    });
    await expectInvalid(tx, TX_ERROR_INSUFFICIENT_GAS_LIMIT);
  });

  it('skips txs with not enough fee per da gas', async () => {
    gasFees.feePerDaGas = gasFees.feePerDaGas + 1n;
    await expectSkipped(tx, TX_ERROR_INSUFFICIENT_FEE_PER_GAS);
  });

  it('skips txs with not enough fee per l2 gas', async () => {
    gasFees.feePerL2Gas = gasFees.feePerL2Gas + 1n;
    await expectSkipped(tx, TX_ERROR_INSUFFICIENT_FEE_PER_GAS);
  });
});
