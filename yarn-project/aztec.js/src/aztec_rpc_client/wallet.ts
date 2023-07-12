import { AztecAddress, Fr, Point, TxContext } from '@aztec/circuits.js';
import { ContractAbi } from '@aztec/foundation/abi';
import {
  AztecRPC,
  ContractData,
  ContractPublicData,
  DeployedContract,
  ExecutionRequest,
  L2BlockL2Logs,
  NodeInfo,
  Tx,
  TxExecutionRequest,
  TxHash,
  TxReceipt,
} from '@aztec/types';

import { AccountImplementation } from '../account_impl/index.js';

/**
 * The wallet interface.
 */
export type Wallet = AccountImplementation & AztecRPC;

/**
 * A base class for Wallet implementations
 */
export abstract class BaseWallet implements Wallet {
  constructor(protected readonly rpc: AztecRPC) {}
  abstract getAddress(): AztecAddress;
  abstract createAuthenticatedTxRequest(
    executions: ExecutionRequest[],
    txContext: TxContext,
  ): Promise<TxExecutionRequest>;
  addAccount(
    privKey: Buffer,
    address: AztecAddress,
    partialContractAddress: Fr,
    abi?: ContractAbi | undefined,
  ): Promise<AztecAddress> {
    return this.rpc.addAccount(privKey, address, partialContractAddress, abi);
  }
  getAccounts(): Promise<AztecAddress[]> {
    return this.rpc.getAccounts();
  }
  getAccountPublicKey(address: AztecAddress): Promise<Point> {
    return this.rpc.getAccountPublicKey(address);
  }
  getAccountAddress(publicKey: Point): Promise<AztecAddress> {
    return this.rpc.getAccountAddress(publicKey);
  }
  addContracts(contracts: DeployedContract[]): Promise<void> {
    return this.rpc.addContracts(contracts);
  }
  isContractDeployed(contract: AztecAddress): Promise<boolean> {
    return this.rpc.isContractDeployed(contract);
  }
  simulateTx(txRequest: TxExecutionRequest, optionalFromAddress?: AztecAddress | undefined): Promise<Tx> {
    return this.rpc.simulateTx(txRequest, optionalFromAddress);
  }
  sendTx(tx: Tx): Promise<TxHash> {
    return this.rpc.sendTx(tx);
  }
  getTxReceipt(txHash: TxHash): Promise<TxReceipt> {
    return this.rpc.getTxReceipt(txHash);
  }
  getStorageAt(contract: AztecAddress, storageSlot: Fr): Promise<any> {
    return this.rpc.getStorageAt(contract, storageSlot);
  }
  viewTx(functionName: string, args: any[], to: AztecAddress, from?: AztecAddress | undefined): Promise<any> {
    return this.rpc.viewTx(functionName, args, to, from);
  }
  getContractData(contractAddress: AztecAddress): Promise<ContractPublicData | undefined> {
    return this.rpc.getContractData(contractAddress);
  }
  getContractInfo(contractAddress: AztecAddress): Promise<ContractData | undefined> {
    return this.rpc.getContractInfo(contractAddress);
  }
  getUnencryptedLogs(from: number, take: number): Promise<L2BlockL2Logs[]> {
    return this.rpc.getUnencryptedLogs(from, take);
  }
  getBlockNum(): Promise<number> {
    return this.rpc.getBlockNum();
  }
  getNodeInfo(): Promise<NodeInfo> {
    return this.rpc.getNodeInfo();
  }
}

/**
 * A simple wallet implementation that forwards authentication requests to a provided account implementation.
 */
export class AccountWallet extends BaseWallet {
  constructor(rpc: AztecRPC, protected accountImpl: AccountImplementation) {
    super(rpc);
  }
  getAddress(): AztecAddress {
    return this.accountImpl.getAddress();
  }
  createAuthenticatedTxRequest(executions: ExecutionRequest[], txContext: TxContext): Promise<TxExecutionRequest> {
    return this.accountImpl.createAuthenticatedTxRequest(executions, txContext);
  }
}
