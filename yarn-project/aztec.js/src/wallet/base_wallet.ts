import {
  type AuthWitness,
  type EventMetadataDefinition,
  type ExtendedNote,
  type GetUnencryptedLogsResponse,
  type IncomingNotesFilter,
  type L2Block,
  type LogFilter,
  type OutgoingNotesFilter,
  type PXE,
  type PXEInfo,
  type PrivateExecutionResult,
  type SiblingPath,
  type SyncStatus,
  type Tx,
  type TxExecutionRequest,
  type TxHash,
  type TxProvingResult,
  type TxReceipt,
  type TxSimulationResult,
  type UniqueNote,
} from '@aztec/circuit-types';
import {
  type AztecAddress,
  type CompleteAddress,
  type ContractClassWithId,
  type ContractInstanceWithAddress,
  type Fr,
  type GasFees,
  type L1_TO_L2_MSG_TREE_HEIGHT,
  type NodeInfo,
  type PartialAddress,
  type Point,
} from '@aztec/circuits.js';
import type { AbiDecoded, ContractArtifact } from '@aztec/foundation/abi';

import { type Wallet } from '../account/wallet.js';
import { type ExecutionRequestInit } from '../entrypoint/entrypoint.js';
import { type IntentAction, type IntentInnerHash } from '../utils/authwit.js';

/**
 * A base class for Wallet implementations
 */
export abstract class BaseWallet implements Wallet {
  constructor(protected readonly pxe: PXE, private scopes?: AztecAddress[]) {}

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
  getContractInstance(address: AztecAddress): Promise<ContractInstanceWithAddress | undefined> {
    return this.pxe.getContractInstance(address);
  }
  getContractClass(id: Fr): Promise<ContractClassWithId | undefined> {
    return this.pxe.getContractClass(id);
  }
  getContractArtifact(id: Fr): Promise<ContractArtifact | undefined> {
    return this.pxe.getContractArtifact(id);
  }
  addCapsule(capsule: Fr[]): Promise<void> {
    return this.pxe.addCapsule(capsule);
  }
  registerAccount(secretKey: Fr, partialAddress: PartialAddress): Promise<CompleteAddress> {
    return this.pxe.registerAccount(secretKey, partialAddress);
  }
  getRegisteredAccounts(): Promise<CompleteAddress[]> {
    return this.pxe.getRegisteredAccounts();
  }
  getRegisteredAccount(address: AztecAddress): Promise<CompleteAddress | undefined> {
    return this.pxe.getRegisteredAccount(address);
  }
  registerContact(address: AztecAddress): Promise<AztecAddress> {
    return this.pxe.registerContact(address);
  }
  getContacts(): Promise<AztecAddress[]> {
    return this.pxe.getContacts();
  }
  async removeContact(address: AztecAddress): Promise<void> {
    await this.pxe.removeContact(address);
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
    profile?: boolean,
  ): Promise<TxSimulationResult> {
    return this.pxe.simulateTx(txRequest, simulatePublic, msgSender, skipTxValidation, profile, this.scopes);
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
  getIncomingNotes(filter: IncomingNotesFilter): Promise<UniqueNote[]> {
    return this.pxe.getIncomingNotes(filter);
  }
  getOutgoingNotes(filter: OutgoingNotesFilter): Promise<UniqueNote[]> {
    return this.pxe.getOutgoingNotes(filter);
  }
  getPublicStorageAt(contract: AztecAddress, storageSlot: Fr): Promise<any> {
    return this.pxe.getPublicStorageAt(contract, storageSlot);
  }
  addNote(note: ExtendedNote): Promise<void> {
    return this.pxe.addNote(note, this.getAddress());
  }
  addNullifiedNote(note: ExtendedNote): Promise<void> {
    return this.pxe.addNullifiedNote(note);
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
  getUnencryptedLogs(filter: LogFilter): Promise<GetUnencryptedLogsResponse> {
    return this.pxe.getUnencryptedLogs(filter);
  }
  getContractClassLogs(filter: LogFilter): Promise<GetUnencryptedLogsResponse> {
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
  isGlobalStateSynchronized() {
    return this.pxe.isGlobalStateSynchronized();
  }
  getSyncStatus(): Promise<SyncStatus> {
    return this.pxe.getSyncStatus();
  }
  addAuthWitness(authWitness: AuthWitness) {
    return this.pxe.addAuthWitness(authWitness);
  }
  getAuthWitness(messageHash: Fr) {
    return this.pxe.getAuthWitness(messageHash);
  }
  isContractClassPubliclyRegistered(id: Fr): Promise<boolean> {
    return this.pxe.isContractClassPubliclyRegistered(id);
  }
  isContractPubliclyDeployed(address: AztecAddress): Promise<boolean> {
    return this.pxe.isContractPubliclyDeployed(address);
  }
  isContractInitialized(address: AztecAddress): Promise<boolean> {
    return this.pxe.isContractInitialized(address);
  }
  getPXEInfo(): Promise<PXEInfo> {
    return this.pxe.getPXEInfo();
  }
  getEncryptedEvents<T>(
    event: EventMetadataDefinition,
    from: number,
    limit: number,
    vpks: Point[] = [
      this.getCompleteAddress().publicKeys.masterIncomingViewingPublicKey,
      this.getCompleteAddress().publicKeys.masterOutgoingViewingPublicKey,
    ],
  ): Promise<T[]> {
    return this.pxe.getEncryptedEvents(event, from, limit, vpks);
  }
  getUnencryptedEvents<T>(event: EventMetadataDefinition, from: number, limit: number): Promise<T[]> {
    return this.pxe.getUnencryptedEvents(event, from, limit);
  }
  public getL1ToL2MembershipWitness(
    contractAddress: AztecAddress,
    messageHash: Fr,
    secret: Fr,
  ): Promise<[bigint, SiblingPath<typeof L1_TO_L2_MSG_TREE_HEIGHT>]> {
    return this.pxe.getL1ToL2MembershipWitness(contractAddress, messageHash, secret);
  }
}
