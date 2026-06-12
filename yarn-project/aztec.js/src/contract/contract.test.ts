import { Fr } from '@aztec/foundation/curves/bn254';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  CompleteAddress,
  type ContractInstanceWithAddress,
  getContractClassFromArtifact,
} from '@aztec/stdlib/contract';
import type { TxExecutionRequest, TxReceipt, UtilityExecutionResult } from '@aztec/stdlib/tx';
import { OFFCHAIN_MESSAGE_IDENTIFIER } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import type { Account } from '../account/account.js';
import { testContractArtifact } from '../test/fixtures.js';
import type { TxSimulationResultWithAppOffset } from '../wallet/tx_simulation_result_with_app_offset.js';
import type { Wallet } from '../wallet/wallet.js';
import { Contract } from './contract.js';

describe('Contract Class', () => {
  let wallet: MockProxy<Wallet>;
  let contractAddress: AztecAddress;
  let account: MockProxy<Account>;
  let accountAddress: CompleteAddress;
  let contractInstance: ContractInstanceWithAddress;

  const mockTxRequest = { type: 'TxRequest' } as any as TxExecutionRequest;
  const mockTxReceipt = { type: 'TxReceipt' } as any as TxReceipt;
  const mockTxSimulationResultWithAppOffset = {
    type: 'TxSimulationResultWithAppOffset',
    result: 1n,
  } as any as TxSimulationResultWithAppOffset;
  const mockUtilityResultValue = {
    result: [new Fr(42)],
    offchainEffects: [],
    anchorBlockTimestamp: 0n,
  } as any as UtilityExecutionResult;

  beforeEach(async () => {
    contractAddress = await AztecAddress.random();
    account = mock<Account>();
    accountAddress = await CompleteAddress.random();
    account.getCompleteAddress.mockReturnValue(accountAddress);
    const contractClass = await getContractClassFromArtifact(testContractArtifact);
    contractInstance = {
      address: contractAddress,
      currentContractClassId: contractClass.id,
      originalContractClassId: contractClass.id,
    } as ContractInstanceWithAddress;

    wallet = mock<Wallet>();
    wallet.simulateTx.mockResolvedValue(mockTxSimulationResultWithAppOffset);
    account.createTxExecutionRequest.mockResolvedValue(mockTxRequest);
    wallet.registerContract.mockResolvedValue(contractInstance);
    wallet.sendTx.mockResolvedValue({ receipt: mockTxReceipt, offchainEffects: [], offchainMessages: [] });
    wallet.executeUtility.mockResolvedValue(mockUtilityResultValue);
  });

  it('should create and send a contract method tx', async () => {
    const fooContract = Contract.at(contractAddress, testContractArtifact, wallet);
    const param0 = 12;
    const param1 = 345n;
    const { receipt } = await fooContract.methods.bar(param0, param1).send({ from: account.getAddress() });

    expect(receipt).toBe(mockTxReceipt);
    expect(wallet.sendTx).toHaveBeenCalledTimes(1);
  });

  it('should call view on a utility function', async () => {
    const fooContract = Contract.at(contractAddress, testContractArtifact, wallet);
    const { result } = await fooContract.methods.qux(123n).simulate({ from: account.getAddress() });
    expect(wallet.executeUtility).toHaveBeenCalledTimes(1);
    expect(wallet.executeUtility).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'qux', to: contractAddress }),
      expect.objectContaining({ from: account.getAddress() }),
    );
    expect(result).toBe(42n);
  });

  it('throws when overrides are passed to a utility function simulation', async () => {
    const fooContract = Contract.at(contractAddress, testContractArtifact, wallet);
    await expect(
      fooContract.methods.qux(123n).simulate({
        from: account.getAddress(),
        overrides: { publicStorage: [{ contract: contractAddress, slot: new Fr(1), value: new Fr(42) }] },
      }),
    ).rejects.toThrow(/not supported for utility/);
    expect(wallet.executeUtility).not.toHaveBeenCalled();
  });

  it('should extract offchain messages with anchor block timestamp on simulate', async () => {
    const recipient = await AztecAddress.random();
    const msgPayload = [Fr.random(), Fr.random()];
    const anchorBlockTimestamp = 9999n;

    const txSimResult = mock<TxSimulationResultWithAppOffset>();
    txSimResult.getPrivateReturnValuesOfAppCall.mockReturnValue({ values: [] } as any);
    Object.defineProperty(txSimResult, 'offchainEffects', {
      value: [
        {
          data: [OFFCHAIN_MESSAGE_IDENTIFIER, recipient.toField(), ...msgPayload],
          contractAddress,
        },
      ],
    });
    Object.defineProperty(txSimResult, 'publicInputs', {
      value: {
        constants: { anchorBlockHeader: { globalVariables: { timestamp: anchorBlockTimestamp } } },
      },
    });

    wallet.simulateTx.mockResolvedValue(txSimResult);

    const fooContract = Contract.at(contractAddress, testContractArtifact, wallet);
    const result = await fooContract.methods.bar(1, 2).simulate({ from: account.getAddress() });

    expect(result.offchainMessages).toHaveLength(1);
    expect(result.offchainMessages[0]).toEqual({
      recipient,
      payload: msgPayload,
      contractAddress,
      anchorBlockTimestamp,
    });
  });

  it('should extract offchain messages with anchor block timestamp on utility simulate', async () => {
    const recipient = await AztecAddress.random();
    const emitterAddress = await AztecAddress.random();
    const msgPayload = [Fr.random(), Fr.random()];
    const rawEffectData = [Fr.random(), Fr.random(), Fr.random()];
    const anchorBlockTimestamp = 77777n;

    wallet.executeUtility.mockResolvedValue({
      result: [new Fr(42)],
      offchainEffects: [
        {
          data: [OFFCHAIN_MESSAGE_IDENTIFIER, recipient.toField(), ...msgPayload],
          contractAddress: emitterAddress,
        },
        {
          data: rawEffectData,
          contractAddress: emitterAddress,
        },
      ],
      anchorBlockTimestamp,
    } as any);

    const fooContract = Contract.at(contractAddress, testContractArtifact, wallet);
    const result = await fooContract.methods.qux(123n).simulate({ from: account.getAddress() });

    expect(result.offchainMessages).toHaveLength(1);
    expect(result.offchainMessages[0]).toEqual({
      recipient,
      payload: msgPayload,
      contractAddress: emitterAddress,
      anchorBlockTimestamp,
    });
    expect(result.offchainEffects).toHaveLength(1);
    expect(result.offchainEffects[0]).toEqual({ data: rawEffectData, contractAddress: emitterAddress });
  });

  it('allows nullish values for Option parameters', () => {
    const fooContract = Contract.at(contractAddress, testContractArtifact, wallet);

    expect(() => fooContract.methods.optionEcho(undefined)).not.toThrow();
    expect(() => fooContract.methods.optionEcho(null)).not.toThrow();
  });

  it('still rejects nullish values for non-Option parameters', () => {
    const fooContract = Contract.at(contractAddress, testContractArtifact, wallet);

    expect(() => fooContract.methods.bar(undefined, 123n)).toThrow(
      'Null or undefined arguments are only allowed for Option<T> parameters in bar(value: Field, value: Field). Received: (undefined, 123n).',
    );
    expect(() => fooContract.methods.qux(null)).toThrow(
      'Null or undefined arguments are only allowed for Option<T> parameters in qux(value: Field). Received: (null).',
    );
  });

  it('rejects nullish non-Option param even when Option param is valid', () => {
    const fooContract = Contract.at(contractAddress, testContractArtifact, wallet);

    expect(() => fooContract.methods.mixedParams({ w: 1n }, undefined)).toThrow(
      'Null or undefined arguments are only allowed for Option<T> parameters in mixedParams(optValue: Option<Field>, aField: Field). Received: ({ w: 1n }, undefined).',
    );
  });

  // Check basic formatting of null/undefined related errors
  it.each([
    ['undefined', undefined, 'undefined'],
    ['null', null, 'null'],
    ['number', 42, '42'],
    ['bigint', 123n, '123n'],
    ['string', 'hello', 'hello'],
    ['boolean', true, 'true'],
    ['symbol', Symbol('test'), 'Symbol(test)'],
    ['object', { a: 1n, b: 'x' }, '{ a: 1n, b: x }'],
    ['array', [1n, 2n], '[1n, 2n]'],
  ])('formats %s argument in error message', (_label, value, expectedFormatted) => {
    const fooContract = Contract.at(contractAddress, testContractArtifact, wallet);

    // pass the test value first and undefined second to trigger the error whose message we want to test for
    expect(() => fooContract.methods.bar(value, undefined)).toThrow(`Received: (${expectedFormatted}, undefined).`);
  });
});
