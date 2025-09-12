import { Fr } from '@aztec/foundation/fields';
import type { ContractDataProvider } from '@aztec/pxe/server';
import { type ContractArtifact, FunctionSelector, FunctionType } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  type ContractClassPublic,
  type ContractDataSource,
  type ContractInstanceWithAddress,
  computePrivateFunctionsRoot,
  computePublicBytecodeCommitment,
  getContractClassPrivateFunctionFromArtifact,
} from '@aztec/stdlib/contract';

export class TXEPublicContractDataSource implements ContractDataSource {
  #privateFunctionsRoot: Map<string, Buffer> = new Map();
  constructor(
    private blockNumber: number,
    private contractDataProvider: ContractDataProvider,
  ) {}

  getBlockNumber(): Promise<number> {
    return Promise.resolve(this.blockNumber);
  }

  async getContractClass(id: Fr): Promise<ContractClassPublic | undefined> {
    const contractClass = await this.contractDataProvider.getContractClass(id);
    if (!contractClass) {
      return;
    }
    const artifact = await this.contractDataProvider.getContractArtifact(id);
    if (!artifact) {
      return;
    }

    let privateFunctionsRoot;
    if (!this.#privateFunctionsRoot.has(id.toString())) {
      const privateFunctions = await Promise.all(
        artifact.functions
          .filter(fn => fn.functionType === FunctionType.PRIVATE)
          .map(fn => getContractClassPrivateFunctionFromArtifact(fn)),
      );
      privateFunctionsRoot = await computePrivateFunctionsRoot(privateFunctions);
      this.#privateFunctionsRoot.set(id.toString(), privateFunctionsRoot.toBuffer());
    } else {
      privateFunctionsRoot = Fr.fromBuffer(this.#privateFunctionsRoot.get(id.toString())!);
    }

    return {
      id,
      artifactHash: contractClass!.artifactHash,
      packedBytecode: contractClass!.packedBytecode,
      privateFunctionsRoot,
      version: contractClass!.version,
      privateFunctions: [],
      utilityFunctions: [],
    };
  }

  async getBytecodeCommitment(id: Fr): Promise<Fr | undefined> {
    const contractClass = await this.contractDataProvider.getContractClass(id);
    return contractClass && computePublicBytecodeCommitment(contractClass.packedBytecode);
  }

  async getContract(address: AztecAddress): Promise<ContractInstanceWithAddress | undefined> {
    const instance = await this.contractDataProvider.getContractInstance(address);
    return instance && { ...instance, address };
  }

  getContractClassIds(): Promise<Fr[]> {
    throw new Error('Method not implemented.');
  }

  async getContractArtifact(address: AztecAddress): Promise<ContractArtifact | undefined> {
    const instance = await this.contractDataProvider.getContractInstance(address);
    return instance && this.contractDataProvider.getContractArtifact(instance.currentContractClassId);
  }

  async getDebugFunctionName(address: AztecAddress, selector: FunctionSelector): Promise<string | undefined> {
    return await this.contractDataProvider.getDebugFunctionName(address, selector);
  }

  registerContractFunctionSignatures(_signatures: []): Promise<void> {
    return Promise.resolve();
  }
}
