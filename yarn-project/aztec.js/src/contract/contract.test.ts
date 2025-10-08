import { type ContractArtifact, FunctionType } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  CompleteAddress,
  type ContractInstanceWithAddress,
  getContractClassFromArtifact,
} from '@aztec/stdlib/contract';
import type {
  Tx,
  TxExecutionRequest,
  TxHash,
  TxProvingResult,
  TxReceipt,
  TxSimulationResult,
  UtilitySimulationResult,
} from '@aztec/stdlib/tx';

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

  const mockTx = { type: 'Tx' } as any as Tx;
  const mockTxProvingResult = { type: 'TxProvingResult', toTx: () => mockTx } as any as TxProvingResult;
  const mockTxRequest = { type: 'TxRequest' } as any as TxExecutionRequest;
  const mockTxHash = { type: 'TxHash' } as any as TxHash;
  const mockTxReceipt = { type: 'TxReceipt' } as any as TxReceipt;
  const mockTxSimulationResult = { type: 'TxSimulationResult', result: 1n } as any as TxSimulationResult;
  const mockUtilityResultValue = { type: 'UtilitySimulationResult' } as any as UtilitySimulationResult;

  const defaultArtifact: ContractArtifact = {
    name: 'FooContract',
    functions: [
      {
        name: 'bar',
        isInitializer: false,
        functionType: FunctionType.PRIVATE,
        isInternal: false,
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
        verificationKey: 'fake-verification-key',
      },
      {
        name: 'public_dispatch',
        isInitializer: false,
        isStatic: false,
        functionType: FunctionType.PUBLIC,
        isInternal: false,
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
        isInternal: false,
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
    wallet.sendTx.mockResolvedValue(mockTxHash);
    wallet.simulateUtility.mockResolvedValue(mockUtilityResultValue);
    wallet.getTxReceipt.mockResolvedValue(mockTxReceipt);
    wallet.proveTx.mockResolvedValue(mockTxProvingResult);
  });

  it('should create and send a contract method tx', async () => {
    const fooContract = await Contract.at(contractAddress, defaultArtifact, wallet);
    const param0 = 12;
    const param1 = 345n;
    const sentTx = fooContract.methods.bar(param0, param1).send({ from: account.getAddress() });
    const txHash = await sentTx.getTxHash();
    const receipt = await sentTx.getReceipt();

    expect(txHash).toBe(mockTxHash);
    expect(receipt).toBe(mockTxReceipt);
    expect(wallet.sendTx).toHaveBeenCalledTimes(1);
    expect(wallet.sendTx).toHaveBeenCalledWith(mockTx);
  });

  it('should call view on a utility function', async () => {
    const fooContract = await Contract.at(contractAddress, defaultArtifact, wallet);
    const result = await fooContract.methods.qux(123n).simulate({ from: account.getAddress() });
    expect(wallet.simulateUtility).toHaveBeenCalledTimes(1);
    expect(wallet.simulateUtility).toHaveBeenCalledWith('qux', [123n], contractAddress, []);
    expect(result).toBe(mockUtilityResultValue.result);
  });
});
