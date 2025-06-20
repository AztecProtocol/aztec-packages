import { Fr } from '@aztec/foundation/fields';
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

import type { TXE } from '../oracle/txe_oracle.js';

export class TXEPublicContractDataSource implements ContractDataSource {
  #privateFunctionsRoot: Map<string, Buffer> = new Map();
  constructor(private txeOracle: TXE) {}

  getBlockNumber(): Promise<number> {
    return this.txeOracle.getBlockNumber();
  }

  async getContractClass(id: Fr): Promise<ContractClassPublic | undefined> {
    const contractClass = await this.txeOracle.getContractDataProvider().getContractClass(id);
    if (!contractClass) {
      return;
    }
    const artifact = await this.txeOracle.getContractDataProvider().getContractArtifact(id);
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
    const contractClass = await this.txeOracle.getContractDataProvider().getContractClass(id);
    return contractClass && computePublicBytecodeCommitment(contractClass.packedBytecode);
  }

  async getContract(address: AztecAddress): Promise<ContractInstanceWithAddress | undefined> {
    const instance = await this.txeOracle.getContractDataProvider().getContractInstance(address);
    return instance && { ...instance, address };
  }

  getContractClassIds(): Promise<Fr[]> {
    throw new Error('Method not implemented.');
  }

  async getContractArtifact(address: AztecAddress): Promise<ContractArtifact | undefined> {
    const instance = await this.txeOracle.getContractDataProvider().getContractInstance(address);
    return instance && this.txeOracle.getContractDataProvider().getContractArtifact(instance.currentContractClassId);
  }

  async getDebugFunctionName(address: AztecAddress, selector: FunctionSelector): Promise<string | undefined> {
    return await this.txeOracle.getContractDataProvider().getDebugFunctionName(address, selector);
  }

  registerContractFunctionSignatures(_signatures: []): Promise<void> {
    return Promise.resolve();
  }
}
