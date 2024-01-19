import { ExtendedContractData, Tx, TxExecutionRequest, TxHash, TxReceipt } from '@aztec/circuit-types';
import { AztecAddress, CompleteAddress, EthAddress } from '@aztec/circuits.js';
import { L1ContractAddresses } from '@aztec/ethereum';
import { ABIParameterVisibility, ContractArtifact, FunctionType } from '@aztec/foundation/abi';
import { NodeInfo } from '@aztec/types/interfaces';

import { MockProxy, mock } from 'jest-mock-extended';

import { Wallet } from '../wallet/index.js';
import { Contract } from './contract.js';

describe('Contract Class', () => {
  let wallet: MockProxy<Wallet>;
  let resolvedExtendedContractData: ExtendedContractData;
  let contractAddress: AztecAddress;
  let account: CompleteAddress;

  const mockTx = { type: 'Tx' } as any as Tx;
  const mockTxRequest = { type: 'TxRequest' } as any as TxExecutionRequest;
  const mockTxHash = { type: 'TxHash' } as any as TxHash;
  const mockTxReceipt = { type: 'TxReceipt' } as any as TxReceipt;
  const mockViewResultValue = 1;
  const l1Addresses: L1ContractAddresses = {
    availabilityOracleAddress: EthAddress.random(),
    rollupAddress: EthAddress.random(),
    registryAddress: EthAddress.random(),
    inboxAddress: EthAddress.random(),
    outboxAddress: EthAddress.random(),
    contractDeploymentEmitterAddress: EthAddress.random(),
  };
  const mockNodeInfo: NodeInfo = {
    nodeVersion: 'vx.x.x',
    chainId: 1,
    protocolVersion: 2,
    l1ContractAddresses: l1Addresses,
  };

  const defaultArtifact: ContractArtifact = {
    name: 'FooContract',
    functions: [
      {
        name: 'bar',
        functionType: FunctionType.SECRET,
        isInternal: false,
        debugSymbols: '',
        parameters: [
          {
            name: 'value',
            type: {
              kind: 'field',
            },
            visibility: ABIParameterVisibility.PUBLIC,
          },
          {
            name: 'value',
            type: {
              kind: 'field',
            },
            visibility: ABIParameterVisibility.SECRET,
          },
        ],
        returnTypes: [],
        bytecode: '0af',
      },
      {
        name: 'baz',
        functionType: FunctionType.OPEN,
        isInternal: false,
        parameters: [],
        returnTypes: [],
        bytecode: '0be',
        debugSymbols: '',
      },
      {
        name: 'qux',
        functionType: FunctionType.UNCONSTRAINED,
        isInternal: false,
        parameters: [
          {
            name: 'value',
            type: {
              kind: 'field',
            },
            visibility: ABIParameterVisibility.PUBLIC,
          },
        ],
        returnTypes: [
          {
            kind: 'integer',
            sign: '',
            width: 32,
          },
        ],
        bytecode: '0cd',
        debugSymbols: '',
      },
    ],
    events: [],
    fileMap: {},
  };

  beforeEach(() => {
    resolvedExtendedContractData = ExtendedContractData.random();
    contractAddress = resolvedExtendedContractData.contractData.contractAddress;
    account = CompleteAddress.random();

    wallet = mock<Wallet>();
    wallet.createTxExecutionRequest.mockResolvedValue(mockTxRequest);
    wallet.getExtendedContractData.mockResolvedValue(resolvedExtendedContractData);
    wallet.sendTx.mockResolvedValue(mockTxHash);
    wallet.viewTx.mockResolvedValue(mockViewResultValue);
    wallet.getTxReceipt.mockResolvedValue(mockTxReceipt);
    wallet.getNodeInfo.mockResolvedValue(mockNodeInfo);
    wallet.simulateTx.mockResolvedValue(mockTx);
    wallet.getRegisteredAccounts.mockResolvedValue([account]);
  });

  it('should create and send a contract method tx', async () => {
    const fooContract = await Contract.at(contractAddress, defaultArtifact, wallet);
    const param0 = 12;
    const param1 = 345n;
    const sentTx = fooContract.methods.bar(param0, param1).send();
    const txHash = await sentTx.getTxHash();
    const receipt = await sentTx.getReceipt();

    expect(txHash).toBe(mockTxHash);
    expect(receipt).toBe(mockTxReceipt);
    expect(wallet.createTxExecutionRequest).toHaveBeenCalledTimes(1);
    expect(wallet.sendTx).toHaveBeenCalledTimes(1);
    expect(wallet.sendTx).toHaveBeenCalledWith(mockTx);
  });

  it('should call view on an unconstrained function', async () => {
    const fooContract = await Contract.at(contractAddress, defaultArtifact, wallet);
    const result = await fooContract.methods.qux(123n).view({
      from: account.address,
    });
    expect(wallet.viewTx).toHaveBeenCalledTimes(1);
    expect(wallet.viewTx).toHaveBeenCalledWith('qux', [123n], contractAddress, account.address);
    expect(result).toBe(mockViewResultValue);
  });

  it('should not call create on an unconstrained function', async () => {
    const fooContract = await Contract.at(contractAddress, defaultArtifact, wallet);
    await expect(fooContract.methods.qux().create()).rejects.toThrow();
  });

  it('should not call view on a secret or open function', async () => {
    const fooContract = await Contract.at(contractAddress, defaultArtifact, wallet);
    expect(() => fooContract.methods.bar().view()).toThrow();
    expect(() => fooContract.methods.baz().view()).toThrow();
  });
});
