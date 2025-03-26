import type { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import type { ContractArtifact, FunctionSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractClassPublic, ContractDataSource, ContractInstanceWithAddress } from '@aztec/stdlib/contract';

import { PUBLIC_DISPATCH_FN_NAME } from './index.js';

/**
 * This class is used during public/avm testing to function as a database of
 * contract contract classes and instances. Tests can populate it with classes
 * and instances and then probe it via the ContractDataSource interface.
 *
 * This class does not include any real merkle trees & merkle operations.
 */
export class SimpleContractDataSource implements ContractDataSource {
  public logger = createLogger('simple-contract-data-source');

  // maps contract class ID to class
  private contractClasses: Map<string, ContractClassPublic> = new Map();
  // maps contract instance address to instance
  private contractInstances: Map<string, ContractInstanceWithAddress> = new Map();
  // maps contract instance address to address
  private contractArtifacts: Map<string, ContractArtifact> = new Map();

  /////////////////////////////////////////////////////////////
  // Helper functions not in the contract data source interface
  /**
   * Derive the contract class and instance with some seed.
   * Add both to the contract data source along with the contract artifact.
   */
  async addNewContract(
    contractArtifact: ContractArtifact,
    contractClass: ContractClassPublic,
    contractInstance: ContractInstanceWithAddress,
  ) {
    this.addContractArtifact(contractClass.id, contractArtifact);
    await this.addContractClass(contractClass);
    await this.addContractInstance(contractInstance);
  }

  addContractArtifact(classId: Fr, artifact: ContractArtifact): void {
    this.contractArtifacts.set(classId.toString(), artifact);
  }

  /////////////////////////////////////////////////////////////
  // ContractDataSource function implementations
  getBlockNumber(): Promise<number> {
    throw new Error('Method not implemented.');
  }

  getContractClass(id: Fr): Promise<ContractClassPublic | undefined> {
    return Promise.resolve(this.contractClasses.get(id.toString()));
  }

  getBytecodeCommitment(_id: Fr): Promise<Fr | undefined> {
    return Promise.resolve(undefined);
  }

  getContract(address: AztecAddress): Promise<ContractInstanceWithAddress | undefined> {
    return Promise.resolve(this.contractInstances.get(address.toString()));
  }

  getContractClassIds(): Promise<Fr[]> {
    throw new Error('Method not implemented.');
  }

  async getContractArtifact(address: AztecAddress): Promise<ContractArtifact | undefined> {
    const contractInstance = await this.getContract(address);
    if (!contractInstance) {
      this.logger.warn(`Contract not found at address: ${address}`);
      return undefined;
    }
    this.logger.debug(`Retrieved contract artifact for address: ${address}`);
    this.logger.debug(`Contract class ID: ${contractInstance.currentContractClassId}`);
    return Promise.resolve(this.contractArtifacts.get(contractInstance!.currentContractClassId.toString()));
  }

  getDebugFunctionName(_address: AztecAddress, _selector: FunctionSelector): Promise<string> {
    return Promise.resolve(PUBLIC_DISPATCH_FN_NAME);
  }

  registerContractFunctionSignatures(_address: AztecAddress, _signatures: string[]): Promise<void> {
    return Promise.resolve();
  }

  addContractClass(contractClass: ContractClassPublic): Promise<void> {
    this.contractClasses.set(contractClass.id.toString(), contractClass);
    return Promise.resolve();
  }

  addContractInstance(contractInstance: ContractInstanceWithAddress): Promise<void> {
    this.contractInstances.set(contractInstance.address.toString(), contractInstance);
    return Promise.resolve();
  }
}
