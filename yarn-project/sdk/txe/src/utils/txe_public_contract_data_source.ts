import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { ContractStore } from '@aztec/pxe/server';
import { type ContractArtifact, FunctionSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractClassPublic, ContractDataSource, ContractInstanceWithAddress } from '@aztec/stdlib/contract';

export class TXEPublicContractDataSource implements ContractDataSource {
  constructor(
    private blockNumber: BlockNumber,
    private contractStore: ContractStore,
  ) {}

  getBlockNumber(): Promise<BlockNumber> {
    return Promise.resolve(this.blockNumber);
  }

  async getContractClass(id: Fr): Promise<ContractClassPublic | undefined> {
    const contractClass = await this.contractStore.getContractClassWithPreimage(id);
    if (!contractClass) {
      return;
    }
    return {
      id: contractClass.id,
      artifactHash: contractClass.artifactHash,
      packedBytecode: contractClass.packedBytecode,
      privateFunctionsRoot: contractClass.privateFunctionsRoot,
      version: contractClass.version,
    };
  }

  async getBytecodeCommitment(id: Fr): Promise<Fr | undefined> {
    const contractClass = await this.contractStore.getContractClassWithPreimage(id);
    return contractClass?.publicBytecodeCommitment;
  }

  async getContract(address: AztecAddress): Promise<ContractInstanceWithAddress | undefined> {
    const instance = await this.contractStore.getContractInstance(address);
    // TXE has no contract updates, so the current class always equals the original.
    return instance && { ...instance, address, currentContractClassId: instance.originalContractClassId };
  }

  getContractClassIds(): Promise<Fr[]> {
    throw new Error('Method not implemented.');
  }

  async getContractArtifact(address: AztecAddress): Promise<ContractArtifact | undefined> {
    const instance = await this.getContract(address);
    return instance && this.contractStore.getContractArtifact(instance.originalContractClassId);
  }

  async getDebugFunctionName(address: AztecAddress, selector: FunctionSelector): Promise<string | undefined> {
    const instance = await this.getContract(address);
    return instance && this.contractStore.getDebugFunctionName(instance.originalContractClassId, selector);
  }

  registerContractFunctionSignatures(_signatures: []): Promise<void> {
    return Promise.resolve();
  }
}
