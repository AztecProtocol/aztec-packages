import { type Tx, type TxExecutionRequest, type TxHash, type TxReceipt } from '@aztec/circuit-types';
import { AztecAddress, CompleteAddress, EthAddress } from '@aztec/circuits.js';
import { type L1ContractAddresses } from '@aztec/ethereum';
import { ABIParameterVisibility, type ContractArtifact, type DecodedReturn, FunctionType } from '@aztec/foundation/abi';
import { type NodeInfo } from '@aztec/types/interfaces';

import { type MockProxy, mock } from 'jest-mock-extended';

import { type ContractInstanceWithAddress } from '../index.js';
import { type Wallet } from '../wallet/index.js';
import { Contract } from './contract.js';

describe('Contract Class', () => {
  let wallet: MockProxy<Wallet>;
  let contractAddress: AztecAddress;
  let account: CompleteAddress;
  let contractInstance: ContractInstanceWithAddress;

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
    gasTokenAddress: EthAddress.random(),
    gasPortalAddress: EthAddress.random(),
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
        isInitializer: false,
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
        bytecode: Buffer.alloc(8, 0xfa),
      },
      {
        name: 'baz',
        isInitializer: false,
        functionType: FunctionType.OPEN,
        isInternal: false,
        parameters: [],
        returnTypes: [],
        bytecode: Buffer.alloc(8, 0xfb),
        debugSymbols: '',
      },
      {
        name: 'qux',
        isInitializer: false,
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
        bytecode: Buffer.alloc(8, 0xfc),
        debugSymbols: '',
      },
    ],
    events: [],
    fileMap: {},
  };

  beforeEach(() => {
    contractAddress = AztecAddress.random();
    account = CompleteAddress.random();
    contractInstance = { address: contractAddress } as ContractInstanceWithAddress;

    wallet = mock<Wallet>();
    wallet.createTxExecutionRequest.mockResolvedValue(mockTxRequest);
    wallet.getContractInstance.mockResolvedValue(contractInstance);
    wallet.sendTx.mockResolvedValue(mockTxHash);
    wallet.viewTx.mockResolvedValue(mockViewResultValue as any as DecodedReturn);
    wallet.getTxReceipt.mockResolvedValue(mockTxReceipt);
    wallet.getNodeInfo.mockResolvedValue(mockNodeInfo);
    wallet.proveTx.mockResolvedValue(mockTx);
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
    const result = await fooContract.methods.qux(123n).simulate({
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
});
