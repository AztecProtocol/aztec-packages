import {
  type GetContractClassLogsResponse,
  type GetPublicLogsResponse,
  type L2Block,
  type LogFilter,
  type NotesFilter,
  type Tx,
  type TxExecutionRequest,
  type TxHash,
  type TxProvingResult,
  type TxReceipt,
  type TxSimulationResult,
  type UniqueNote,
} from '@aztec/circuit-types';
import { type AuthWitness } from '@aztec/circuit-types/auth-witness';
import {
  type ContractClassMetadata,
  type ContractMetadata,
  type EventMetadataDefinition,
  type PXE,
  type PXEInfo,
  type PrivateExecutionResult,
} from '@aztec/circuit-types/interfaces/client';
import type { AbiDecoded, ContractArtifact } from '@aztec/circuits.js/abi';
import { type AztecAddress } from '@aztec/circuits.js/aztec-address';
import type {
  CompleteAddress,
  ContractInstanceWithAddress,
  NodeInfo,
  PartialAddress,
} from '@aztec/circuits.js/contract';
import type { GasFees } from '@aztec/circuits.js/gas';
import { type L1_TO_L2_MSG_TREE_HEIGHT } from '@aztec/constants';
import type { Fr, Point } from '@aztec/foundation/fields';
import type { SiblingPath } from '@aztec/foundation/trees';

import { type Wallet } from '../account/wallet.js';
import { type ExecutionRequestInit } from '../entrypoint/entrypoint.js';
import { type IntentAction, type IntentInnerHash } from '../utils/authwit.js';

/**
 * A base class for Wallet implementations
 */
export abstract class BaseWallet implements Wallet {
  constructor(protected readonly pxe: PXE, private scopes?: AztecAddress[]) {}

  abstract isL1ToL2MessageSynced(l1ToL2Message: Fr): Promise<boolean>;

  abstract getCompleteAddress(): CompleteAddress;

  abstract getChainId(): Fr;

  abstract getVersion(): Fr;

  abstract createTxExecutionRequest(exec: ExecutionRequestInit): Promise<TxExecutionRequest>;

  abstract createAuthWit(intent: Fr | Buffer | IntentInnerHash | IntentAction): Promise<AuthWitness>;

  setScopes(scopes: AztecAddress[]) {
    this.scopes = scopes;
  }

  getScopes() {
    return this.scopes;
  }

  getAddress() {
    return this.getCompleteAddress().address;
  }
  storeCapsule(contract: AztecAddress, storageSlot: Fr, capsule: Fr[]): Promise<void> {
    return this.pxe.storeCapsule(contract, storageSlot, capsule);
  }
  registerAccount(secretKey: Fr, partialAddress: PartialAddress): Promise<CompleteAddress> {
    return this.pxe.registerAccount(secretKey, partialAddress);
  }
  getRegisteredAccounts(): Promise<CompleteAddress[]> {
    return this.pxe.getRegisteredAccounts();
  }
  registerSender(address: AztecAddress): Promise<AztecAddress> {
    return this.pxe.registerSender(address);
  }
  getSenders(): Promise<AztecAddress[]> {
    return this.pxe.getSenders();
  }
  async removeSender(address: AztecAddress): Promise<void> {
    await this.pxe.removeSender(address);
  }
  registerContract(contract: {
    /** Instance */ instance: ContractInstanceWithAddress;
    /** Associated artifact */ artifact?: ContractArtifact;
  }): Promise<void> {
    return this.pxe.registerContract(contract);
  }
  registerContractClass(artifact: ContractArtifact): Promise<void> {
    return this.pxe.registerContractClass(artifact);
  }
  updateContract(contractAddress: AztecAddress, artifact: ContractArtifact): Promise<void> {
    return this.pxe.updateContract(contractAddress, artifact);
  }
  getContracts(): Promise<AztecAddress[]> {
    return this.pxe.getContracts();
  }
  proveTx(txRequest: TxExecutionRequest, privateExecutionResult: PrivateExecutionResult): Promise<TxProvingResult> {
    return this.pxe.proveTx(txRequest, privateExecutionResult);
  }
  simulateTx(
    txRequest: TxExecutionRequest,
    simulatePublic: boolean,
    msgSender?: AztecAddress,
    skipTxValidation?: boolean,
    skipFeeEnforcement?: boolean,
    profile?: boolean,
  ): Promise<TxSimulationResult> {
    return this.pxe.simulateTx(
      txRequest,
      simulatePublic,
      msgSender,
      skipTxValidation,
      skipFeeEnforcement,
      profile,
      this.scopes,
    );
  }
  sendTx(tx: Tx): Promise<TxHash> {
    return this.pxe.sendTx(tx);
  }
  getTxEffect(txHash: TxHash) {
    return this.pxe.getTxEffect(txHash);
  }
  getTxReceipt(txHash: TxHash): Promise<TxReceipt> {
    return this.pxe.getTxReceipt(txHash);
  }
  getNotes(filter: NotesFilter): Promise<UniqueNote[]> {
    return this.pxe.getNotes(filter);
  }
  getPublicStorageAt(contract: AztecAddress, storageSlot: Fr): Promise<any> {
    return this.pxe.getPublicStorageAt(contract, storageSlot);
  }
  getBlock(number: number): Promise<L2Block | undefined> {
    return this.pxe.getBlock(number);
  }
  getCurrentBaseFees(): Promise<GasFees> {
    return this.pxe.getCurrentBaseFees();
  }
  simulateUnconstrained(
    functionName: string,
    args: any[],
    to: AztecAddress,
    from?: AztecAddress | undefined,
  ): Promise<AbiDecoded> {
    return this.pxe.simulateUnconstrained(functionName, args, to, from);
  }
  getPublicLogs(filter: LogFilter): Promise<GetPublicLogsResponse> {
    return this.pxe.getPublicLogs(filter);
  }
  getContractClassLogs(filter: LogFilter): Promise<GetContractClassLogsResponse> {
    return this.pxe.getContractClassLogs(filter);
  }
  getBlockNumber(): Promise<number> {
    return this.pxe.getBlockNumber();
  }
  getProvenBlockNumber(): Promise<number> {
    return this.pxe.getProvenBlockNumber();
  }
  getNodeInfo(): Promise<NodeInfo> {
    return this.pxe.getNodeInfo();
  }
  addAuthWitness(authWitness: AuthWitness) {
    return this.pxe.addAuthWitness(authWitness);
  }
  getAuthWitness(messageHash: Fr) {
    return this.pxe.getAuthWitness(messageHash);
  }
  getPXEInfo(): Promise<PXEInfo> {
    return this.pxe.getPXEInfo();
  }
  getContractClassMetadata(id: Fr, includeArtifact: boolean = false): Promise<ContractClassMetadata> {
    return this.pxe.getContractClassMetadata(id, includeArtifact);
  }
  getContractMetadata(address: AztecAddress): Promise<ContractMetadata> {
    return this.pxe.getContractMetadata(address);
  }
  getPrivateEvents<T>(
    event: EventMetadataDefinition,
    from: number,
    limit: number,
    vpks: Point[] = [this.getCompleteAddress().publicKeys.masterIncomingViewingPublicKey],
  ): Promise<T[]> {
    return this.pxe.getPrivateEvents(event, from, limit, vpks);
  }
  getPublicEvents<T>(event: EventMetadataDefinition, from: number, limit: number): Promise<T[]> {
    return this.pxe.getPublicEvents(event, from, limit);
  }
  public getL1ToL2MembershipWitness(
    contractAddress: AztecAddress,
    messageHash: Fr,
    secret: Fr,
  ): Promise<[bigint, SiblingPath<typeof L1_TO_L2_MSG_TREE_HEIGHT>]> {
    return this.pxe.getL1ToL2MembershipWitness(contractAddress, messageHash, secret);
  }
  getL2ToL1MembershipWitness(blockNumber: number, l2Tol1Message: Fr): Promise<[bigint, SiblingPath<number>]> {
    return this.pxe.getL2ToL1MembershipWitness(blockNumber, l2Tol1Message);
  }
}
