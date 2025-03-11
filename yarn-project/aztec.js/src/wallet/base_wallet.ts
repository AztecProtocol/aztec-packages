import type { L1_TO_L2_MSG_TREE_HEIGHT } from '@aztec/constants';
import type { Fr, Point } from '@aztec/foundation/fields';
import type { SiblingPath } from '@aztec/foundation/trees';
import type { AbiDecoded, ContractArtifact } from '@aztec/stdlib/abi';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { L2Block } from '@aztec/stdlib/block';
import type { CompleteAddress, ContractInstanceWithAddress, NodeInfo, PartialAddress } from '@aztec/stdlib/contract';
import type { GasFees } from '@aztec/stdlib/gas';
import type {
  ContractClassMetadata,
  ContractMetadata,
  EventMetadataDefinition,
  GetContractClassLogsResponse,
  GetPublicLogsResponse,
  PXE,
  PXEInfo,
} from '@aztec/stdlib/interfaces/client';
import type { LogFilter } from '@aztec/stdlib/logs';
import type { NotesFilter, UniqueNote } from '@aztec/stdlib/note';
import type {
  PrivateExecutionResult,
  Tx,
  TxExecutionRequest,
  TxHash,
  TxProvingResult,
  TxReceipt,
  TxSimulationResult,
} from '@aztec/stdlib/tx';

import type { ExecutionRequestInit } from '../../../entrypoints/src/interfaces.js';
import type { IntentAction, IntentInnerHash } from '../utils/authwit.js';
import type { Wallet } from './wallet.js';

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
}
