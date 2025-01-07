import { type Tx, mockTx } from '@aztec/circuit-types';
import { AztecAddress, Fr, FunctionSelector, GasFees, GasSettings, PUBLIC_DISPATCH_SELECTOR } from '@aztec/circuits.js';
import { poseidon2Hash } from '@aztec/foundation/crypto';
import { type Writeable } from '@aztec/foundation/types';
import { FeeJuiceContract } from '@aztec/noir-contracts.js/FeeJuice';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';

import { type MockProxy, mock, mockFn } from 'jest-mock-extended';

import { GasTxValidator, type PublicStateSource } from './gas_validator.js';
import { patchNonRevertibleFn, patchRevertibleFn } from './test_utils.js';

describe('GasTxValidator', () => {
  // Vars for validator.
  let publicStateSource: MockProxy<PublicStateSource>;
  let feeJuiceAddress: AztecAddress;
  let enforceFees: boolean;
  let gasFees: Writeable<GasFees>;
  // Vars for tx.
  let tx: Tx;
  let payer: AztecAddress;
  let expectedBalanceSlot: Fr;
  let feeLimit: bigint;

  beforeEach(() => {
    publicStateSource = mock<PublicStateSource>({
      storageRead: mockFn().mockImplementation((_address: AztecAddress, _slot: Fr) => Fr.ZERO),
    });
    feeJuiceAddress = ProtocolContractAddress.FeeJuice;
    enforceFees = false;
    gasFees = new GasFees(11, 22);

    tx = mockTx(1, { numberOfNonRevertiblePublicCallRequests: 2 });
    tx.data.feePayer = AztecAddress.random();
    tx.data.constants.txContext.gasSettings = GasSettings.default({ maxFeesPerGas: gasFees.clone() });
    payer = tx.data.feePayer;
    expectedBalanceSlot = poseidon2Hash([FeeJuiceContract.storage.balances.slot, payer]);
    feeLimit = tx.data.constants.txContext.gasSettings.getFeeLimit().toBigInt();
  });

  const mockBalance = (balance: bigint) => {
    publicStateSource.storageRead.mockImplementation((address, slot) =>
      Promise.resolve(address.equals(feeJuiceAddress) && slot.equals(expectedBalanceSlot) ? new Fr(balance) : Fr.ZERO),
    );
  };

  const validateTx = async (tx: Tx) => {
    const validator = new GasTxValidator(publicStateSource, feeJuiceAddress, enforceFees, gasFees);
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
    const selector = FunctionSelector.fromSignature('_increase_public_balance((Field),Field)');
    patchNonRevertibleFn(tx, 0, {
      address: ProtocolContractAddress.FeeJuice,
      selector: FunctionSelector.fromField(new Fr(PUBLIC_DISPATCH_SELECTOR)),
      args: [selector.toField(), payer.toField(), new Fr(1n)],
      msgSender: ProtocolContractAddress.FeeJuice,
    });
    await expectValid(tx);
  });

  it('rejects txs if fee payer has not enough balance', async () => {
    mockBalance(feeLimit - 1n);
    await expectInvalid(tx, 'Insufficient fee payer balance');
  });

  it('rejects txs if fee payer has zero balance', async () => {
    await expectInvalid(tx, 'Insufficient fee payer balance');
  });

  it('rejects txs if fee payer claims balance outside setup', async () => {
    mockBalance(feeLimit - 1n);
    patchRevertibleFn(tx, 0, {
      selector: FunctionSelector.fromSignature('_increase_public_balance((Field),Field)'),
      args: [payer.toField(), new Fr(1n)],
    });
    await expectInvalid(tx, 'Insufficient fee payer balance');
  });

  it('allows txs with no fee payer if fees are not enforced', async () => {
    tx.data.feePayer = AztecAddress.ZERO;
    await expectValid(tx);
  });

  it('rejects txs with no fee payer if fees are enforced', async () => {
    enforceFees = true;
    tx.data.feePayer = AztecAddress.ZERO;
    await expectInvalid(tx, 'Missing fee payer');
  });

  it('skips txs with not enough fee per da gas', async () => {
    gasFees.feePerDaGas = gasFees.feePerDaGas.add(new Fr(1));
    await expectSkipped(tx, 'Insufficient fee per gas');
  });

  it('skips txs with not enough fee per l2 gas', async () => {
    gasFees.feePerL2Gas = gasFees.feePerL2Gas.add(new Fr(1));
    await expectSkipped(tx, 'Insufficient fee per gas');
  });
});
