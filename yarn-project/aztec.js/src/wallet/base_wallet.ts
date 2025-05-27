import type { FeeOptions, TxExecutionOptions } from '@aztec/entrypoints/interfaces';
import type { ExecutionPayload } from '@aztec/entrypoints/payload';
import type { Fr } from '@aztec/foundation/fields';
import type { ContractArtifact } from '@aztec/stdlib/abi';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { CompleteAddress, ContractInstanceWithAddress, NodeInfo } from '@aztec/stdlib/contract';
import type { GasFees } from '@aztec/stdlib/gas';
import type {
  ContractClassMetadata,
  ContractMetadata,
  EventMetadataDefinition,
  PXE,
  PXEInfo,
} from '@aztec/stdlib/interfaces/client';
import type {
  PrivateExecutionResult,
  Tx,
  TxExecutionRequest,
  TxHash,
  TxProfileResult,
  TxProvingResult,
  TxReceipt,
  TxSimulationResult,
  UtilitySimulationResult,
} from '@aztec/stdlib/tx';

import type { IntentAction, IntentInnerHash } from '../utils/authwit.js';
import type { Wallet } from './wallet.js';

/**
 * A base class for Wallet implementations
 */
export abstract class BaseWallet implements Wallet {
  constructor(protected readonly pxe: PXE) {}

  abstract getCompleteAddress(): CompleteAddress;

  abstract getChainId(): Fr;

  abstract getVersion(): Fr;

  abstract createTxExecutionRequest(
    exec: ExecutionPayload,
    fee: FeeOptions,
    options: TxExecutionOptions,
  ): Promise<TxExecutionRequest>;

  abstract createAuthWit(intent: Fr | Buffer | IntentInnerHash | IntentAction): Promise<AuthWitness>;

  getAddress() {
    return this.getCompleteAddress().address;
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
  proveTx(txRequest: TxExecutionRequest, privateExecutionResult: PrivateExecutionResult): Promise<TxProvingResult> {
    return this.pxe.proveTx(txRequest, privateExecutionResult);
  }
  profileTx(
    txRequest: TxExecutionRequest,
    profileMode: 'gates' | 'execution-steps' | 'full',
    skipProofGeneration?: boolean,
    msgSender?: AztecAddress,
  ): Promise<TxProfileResult> {
    return this.pxe.profileTx(txRequest, profileMode, skipProofGeneration, msgSender);
  }
  simulateTx(
    txRequest: TxExecutionRequest,
    simulatePublic: boolean,
    msgSender?: AztecAddress,
    skipTxValidation?: boolean,
    skipFeeEnforcement?: boolean,
  ): Promise<TxSimulationResult> {
    return this.pxe.simulateTx(txRequest, simulatePublic, msgSender, skipTxValidation, skipFeeEnforcement);
  }
  sendTx(tx: Tx): Promise<TxHash> {
    return this.pxe.sendTx(tx);
  }
  getCurrentBaseFees(): Promise<GasFees> {
    return this.pxe.getCurrentBaseFees();
  }
  simulateUtility(
    functionName: string,
    args: any[],
    to: AztecAddress,
    authwits?: AuthWitness[],
    from?: AztecAddress,
  ): Promise<UtilitySimulationResult> {
    return this.pxe.simulateUtility(functionName, args, to, authwits, from);
  }
  getNodeInfo(): Promise<NodeInfo> {
    return this.pxe.getNodeInfo();
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

  getTxReceipt(txHash: TxHash): Promise<TxReceipt> {
    return this.pxe.getTxReceipt(txHash);
  }

  getPrivateEvents<T>(
    contractAddress: AztecAddress,
    event: EventMetadataDefinition,
    from: number,
    limit: number,
    recipients: AztecAddress[] = [this.getCompleteAddress().address],
  ): Promise<T[]> {
    return this.pxe.getPrivateEvents(contractAddress, event, from, limit, recipients);
  }
  getPublicEvents<T>(event: EventMetadataDefinition, from: number, limit: number): Promise<T[]> {
    return this.pxe.getPublicEvents(event, from, limit);
  }
}
