import { Fr } from '@aztec/foundation/curves/bn254';
import { type ContractArtifact, FunctionType } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  CompleteAddress,
  type ContractInstanceWithAddress,
  getContractClassFromArtifact,
} from '@aztec/stdlib/contract';
import type { TxExecutionRequest, TxReceipt, TxSimulationResult, UtilityExecutionResult } from '@aztec/stdlib/tx';
import { OFFCHAIN_MESSAGE_IDENTIFIER } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import type { Account } from '../account/account.js';
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
  const mockTxSimulationResult = { type: 'TxSimulationResult', result: 1n } as any as TxSimulationResult;
  const mockUtilityResultValue = {
    result: [new Fr(42)],
    offchainEffects: [],
    anchorBlockTimestamp: 0n,
  } as any as UtilityExecutionResult;

  const defaultArtifact: ContractArtifact = {
    name: 'FooContract',
    functions: [
      {
        name: 'bar',
        isInitializer: false,
        functionType: FunctionType.PRIVATE,
        isOnlySelf: false,
        isStatic: false,
        debugSymbols: '',
        parameters: [
          {
            name: 'value',
            type: {
              kind: 'field',
            },
            visibility: 'public',
          },
          {
            name: 'value',
            type: {
              kind: 'field',
            },
            visibility: 'private',
          },
        ],
        returnTypes: [],
        errorTypes: {},
        bytecode: Buffer.alloc(8, 0xfa),
        verificationKey: Buffer.alloc(4064).toString('base64'),
      },
      {
        name: 'public_dispatch',
        isInitializer: false,
        isStatic: false,
        functionType: FunctionType.PUBLIC,
        isOnlySelf: false,
        parameters: [
          {
            name: 'selector',
            type: {
              kind: 'field',
            },
            visibility: 'public',
          },
        ],
        returnTypes: [],
        errorTypes: {},
        bytecode: Buffer.alloc(8, 0xfb),
        debugSymbols: '',
      },
      {
        name: 'qux',
        isInitializer: false,
        isStatic: false,
        functionType: FunctionType.UTILITY,
        isOnlySelf: false,
        parameters: [
          {
            name: 'value',
            type: {
              kind: 'field',
            },
            visibility: 'public',
          },
        ],
        returnTypes: [
          {
            kind: 'integer',
            sign: 'unsigned',
            width: 32,
          },
        ],
        bytecode: Buffer.alloc(8, 0xfc),
        debugSymbols: '',
        errorTypes: {},
      },
      {
        name: 'optionEcho',
        isInitializer: false,
        functionType: FunctionType.PRIVATE,
        isOnlySelf: false,
        isStatic: false,
        parameters: [
          {
            name: 'value',
            type: {
              kind: 'struct',
              path: 'std::option::Option',
              fields: [
                {
                  name: '_is_some',
                  type: {
                    kind: 'boolean',
                  },
                },
                {
                  name: '_value',
                  type: {
                    kind: 'field',
                  },
                },
              ],
            },
            visibility: 'private',
          },
        ],
        returnTypes: [],
        errorTypes: {},
        bytecode: Buffer.alloc(8, 0xfd),
        verificationKey: Buffer.alloc(4064).toString('base64'),
        debugSymbols: '',
      },
      {
        name: 'mixedParams',
        isInitializer: false,
        functionType: FunctionType.PRIVATE,
        isOnlySelf: false,
        isStatic: false,
        parameters: [
          {
            name: 'optValue',
            type: {
              kind: 'struct',
              path: 'std::option::Option',
              fields: [
                { name: '_is_some', type: { kind: 'boolean' } },
                { name: '_value', type: { kind: 'field' } },
              ],
            },
            visibility: 'private',
          },
          {
            name: 'aField',
            type: { kind: 'field' },
            visibility: 'private',
          },
        ],
        returnTypes: [],
        errorTypes: {},
        bytecode: Buffer.alloc(8, 0xfe),
        verificationKey: Buffer.alloc(4064).toString('base64'),
        debugSymbols: '',
      },
    ],
    nonDispatchPublicFunctions: [],
    outputs: {
      structs: {},
      globals: {},
    },
    fileMap: {},
    storageLayout: {},
  };

  beforeEach(async () => {
    contractAddress = await AztecAddress.random();
    account = mock<Account>();
    accountAddress = await CompleteAddress.random();
    account.getCompleteAddress.mockReturnValue(accountAddress);
    const contractClass = await getContractClassFromArtifact(defaultArtifact);
    contractInstance = {
      address: contractAddress,
      currentContractClassId: contractClass.id,
      originalContractClassId: contractClass.id,
    } as ContractInstanceWithAddress;

    wallet = mock<Wallet>();
    wallet.simulateTx.mockResolvedValue(mockTxSimulationResult);
    account.createTxExecutionRequest.mockResolvedValue(mockTxRequest);
    wallet.registerContract.mockResolvedValue(contractInstance);
    wallet.sendTx.mockResolvedValue({ receipt: mockTxReceipt, offchainEffects: [], offchainMessages: [] });
    wallet.executeUtility.mockResolvedValue(mockUtilityResultValue);
  });

  it('should create and send a contract method tx', async () => {
    const fooContract = Contract.at(contractAddress, defaultArtifact, wallet);
    const param0 = 12;
    const param1 = 345n;
    const { receipt } = await fooContract.methods.bar(param0, param1).send({ from: account.getAddress() });

    expect(receipt).toBe(mockTxReceipt);
    expect(wallet.sendTx).toHaveBeenCalledTimes(1);
  });

  it('should call view on a utility function', async () => {
    const fooContract = Contract.at(contractAddress, defaultArtifact, wallet);
    const { result } = await fooContract.methods.qux(123n).simulate({ from: account.getAddress() });
    expect(wallet.executeUtility).toHaveBeenCalledTimes(1);
    expect(wallet.executeUtility).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'qux', to: contractAddress }),
      expect.objectContaining({ scopes: [account.getAddress()] }),
    );
    expect(result).toBe(42n);
  });

  it('should extract offchain messages with anchor block timestamp on simulate', async () => {
    const recipient = await AztecAddress.random();
    const msgPayload = [Fr.random(), Fr.random()];
    const anchorBlockTimestamp = 9999n;

    const txSimResult = mock<TxSimulationResult>();
    txSimResult.getPrivateReturnValues.mockReturnValue({ nested: [{ values: [] }] } as any);
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

    const fooContract = Contract.at(contractAddress, defaultArtifact, wallet);
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

    const fooContract = Contract.at(contractAddress, defaultArtifact, wallet);
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
    const fooContract = Contract.at(contractAddress, defaultArtifact, wallet);

    expect(() => fooContract.methods.optionEcho(undefined)).not.toThrow();
    expect(() => fooContract.methods.optionEcho(null)).not.toThrow();
  });

  it('still rejects nullish values for non-Option parameters', () => {
    const fooContract = Contract.at(contractAddress, defaultArtifact, wallet);

    expect(() => fooContract.methods.bar(undefined, 123n)).toThrow(
      'Null or undefined arguments are only allowed for Option<T> parameters in bar(value: Field, value: Field). Received: (undefined, 123n).',
    );
    expect(() => fooContract.methods.qux(null)).toThrow(
      'Null or undefined arguments are only allowed for Option<T> parameters in qux(value: Field). Received: (null).',
    );
  });

  it('rejects nullish non-Option param even when Option param is valid', () => {
    const fooContract = Contract.at(contractAddress, defaultArtifact, wallet);

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
    const fooContract = Contract.at(contractAddress, defaultArtifact, wallet);

    // pass the test value first and undefined second to trigger the error whose message we want to test for
    expect(() => fooContract.methods.bar(value, undefined)).toThrow(`Received: (${expectedFormatted}, undefined).`);
  });
});
