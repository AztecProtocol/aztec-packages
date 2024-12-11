import { type Tx, mockTx } from '@aztec/circuit-types';
import { AztecAddress, Fr, FunctionSelector, GasFees, GasSettings, PUBLIC_DISPATCH_SELECTOR } from '@aztec/circuits.js';
import { poseidon2Hash } from '@aztec/foundation/crypto';
import { FeeJuiceContract } from '@aztec/noir-contracts.js';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';

import { type MockProxy, mock, mockFn } from 'jest-mock-extended';

import { GasTxValidator, type PublicStateSource } from './gas_validator.js';
import { patchNonRevertibleFn, patchRevertibleFn } from './test_utils.js';

describe('GasTxValidator', () => {
  let validator: GasTxValidator;
  let publicStateSource: MockProxy<PublicStateSource>;
  let feeJuiceAddress: AztecAddress;

  beforeEach(() => {
    feeJuiceAddress = ProtocolContractAddress.FeeJuice;
    publicStateSource = mock<PublicStateSource>({
      storageRead: mockFn().mockImplementation((_address: AztecAddress, _slot: Fr) => Fr.ZERO),
    });

    validator = new GasTxValidator(publicStateSource, feeJuiceAddress, false);
  });

  let tx: Tx;
  let payer: AztecAddress;
  let expectedBalanceSlot: Fr;
  let feeLimit: bigint;

  beforeEach(() => {
    tx = mockTx(1, { numberOfNonRevertiblePublicCallRequests: 2 });
    tx.data.feePayer = AztecAddress.random();
    tx.data.constants.txContext.gasSettings = GasSettings.default({ maxFeesPerGas: new GasFees(10, 10) });
    payer = tx.data.feePayer;
    expectedBalanceSlot = poseidon2Hash([FeeJuiceContract.storage.balances.slot, payer]);
    feeLimit = tx.data.constants.txContext.gasSettings.getFeeLimit().toBigInt();
  });

  const mockBalance = (balance: bigint) => {
    publicStateSource.storageRead.mockImplementation((address, slot) =>
      Promise.resolve(address.equals(feeJuiceAddress) && slot.equals(expectedBalanceSlot) ? new Fr(balance) : Fr.ZERO),
    );
  };

  const expectValidateSuccess = async (tx: Tx) => {
    const result = await validator.validateTxs([tx]);
    expect(result[0].length).toEqual(1);
    expect(result).toEqual([[tx], []]);
  };

  const expectValidateFail = async (tx: Tx) => {
    const result = await validator.validateTxs([tx]);
    expect(result[1].length).toEqual(1);
    expect(result).toEqual([[], [tx]]);
  };

  it('allows fee paying txs if fee payer has enough balance', async () => {
    mockBalance(feeLimit);
    await expectValidateSuccess(tx);
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
    await expectValidateSuccess(tx);
  });

  it('rejects txs if fee payer has not enough balance', async () => {
    mockBalance(feeLimit - 1n);
    await expectValidateFail(tx);
  });

  it('rejects txs if fee payer has zero balance', async () => {
    await expectValidateFail(tx);
  });

  it('rejects txs if fee payer claims balance outside setup', async () => {
    mockBalance(feeLimit - 1n);
    patchRevertibleFn(tx, 0, {
      selector: FunctionSelector.fromSignature('_increase_public_balance((Field),Field)'),
      args: [payer.toField(), new Fr(1n)],
    });
    await expectValidateFail(tx);
  });

  it('allows txs with no fee payer if fees are not enforced', async () => {
    tx.data.feePayer = AztecAddress.ZERO;
    await expectValidateSuccess(tx);
  });

  it('rejects txs with no fee payer if fees are enforced', async () => {
    validator.enforceFees = true;
    tx.data.feePayer = AztecAddress.ZERO;
    await expectValidateFail(tx);
  });
});
