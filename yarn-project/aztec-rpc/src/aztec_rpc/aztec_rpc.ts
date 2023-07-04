import { AztecAddress, EthAddress, Fr } from '@aztec/circuits.js';
import { ContractAbi } from '@aztec/foundation/abi';
import { Point } from '@aztec/foundation/fields';
import {
  ContractData,
  ContractDeploymentTx,
  ContractPublicData,
  L2BlockL2Logs,
  PartialContractAddress,
  Tx,
  TxExecutionRequest,
  TxHash,
} from '@aztec/types';
import { TxReceipt } from '../tx/index.js';
import { PublicKey } from '@aztec/key-store';

/**
 * Represents a deployed contract on the Aztec network.
 * Contains the contract ABI, address, and associated portal contract address.
 */
export interface DeployedContract {
  /**
   * The Application Binary Interface of the deployed contract.
   */
  abi: ContractAbi;
  /**
   * The address representing the contract on L2.
   */
  address: AztecAddress;
  /**
   * The Ethereum address of the L1 portal contract.
   */
  portalContract: EthAddress;
}

/**
 *
 */
export type NodeInfo = {
  /**
   *
   */
  version: number;
  /**
   *
   */
  chainId: number;
};

/**
 * Represents an Aztec RPC implementation.
 * Provides functionality for all the operations needed to interact with the Aztec network,
 * including account management, contract deployment, transaction creation, and execution,
 * as well as storage and view functions for smart contracts.
 */
export interface AztecRPC {
  addAccount(
    privKey: Buffer,
    address: AztecAddress,
    partialContractAddress: PartialContractAddress,
    abi?: ContractAbi,
  ): Promise<AztecAddress>;
  getMessageHash(secret: Fr): Promise<Fr>;
  getDeploymentAddress(
    abi: ContractAbi,
    args: any[],
    portalContract: EthAddress,
    contractAddressSalt: Fr,
    deployerPublicKey: PublicKey,
  ): Promise<[AztecAddress, PartialContractAddress]>;
  getAccounts(): Promise<AztecAddress[]>;
  getAccountImplementation(address?: AztecAddress): Promise<ContractAbi>;
  getAccountPublicKey(address: AztecAddress): Promise<Point>;
  addContracts(contracts: DeployedContract[]): Promise<void>;
  /**
   * Is an L2 contract deployed at this address?
   * @param contractAddress - The contract data address.
   * @returns Whether the contract was deployed.
   */
  isContractDeployed(contract: AztecAddress): Promise<boolean>;
  createDeploymentTx(
    abi: ContractAbi,
    args: any[],
    portalContract: EthAddress,
    contractAddressSalt?: Fr,
    deployerPublicKey?: PublicKey,
    from?: AztecAddress,
  ): Promise<ContractDeploymentTx>;
  simulateTx(txRequest: TxExecutionRequest, optionalFromAddress?: AztecAddress): Promise<Tx>;
  sendTx(tx: Tx): Promise<TxHash>;
  getTxReceipt(txHash: TxHash): Promise<TxReceipt>;
  getStorageAt(contract: AztecAddress, storageSlot: Fr): Promise<any>;
  viewTx(functionName: string, args: any[], to: AztecAddress, from?: AztecAddress): Promise<any>;
  getContractData(contractAddress: AztecAddress): Promise<ContractPublicData | undefined>;
  getContractInfo(contractAddress: AztecAddress): Promise<ContractData | undefined>;
  getUnencryptedLogs(from: number, take: number): Promise<L2BlockL2Logs[]>;
  getBlockNum(): Promise<number>;
  getNodeInfo(): Promise<NodeInfo>;
}
