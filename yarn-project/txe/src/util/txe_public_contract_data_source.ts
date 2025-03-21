import { PUBLIC_DISPATCH_SELECTOR } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { PrivateFunctionsTree } from '@aztec/pxe/server';
import { type ContractArtifact, FunctionSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  type ContractClassPublic,
  type ContractDataSource,
  type ContractInstanceWithAddress,
  type PublicFunction,
  computePublicBytecodeCommitment,
} from '@aztec/stdlib/contract';

import type { TXE } from '../oracle/txe_oracle.js';

export class TXEPublicContractDataSource implements ContractDataSource {
  constructor(private txeOracle: TXE) {}

  getBlockNumber(): Promise<number> {
    return this.txeOracle.getBlockNumber();
  }

  async getContractClass(id: Fr): Promise<ContractClassPublic | undefined> {
    const contractClass = await this.txeOracle.getContractDataProvider().getContractClass(id);
    const artifact = await this.txeOracle.getContractDataProvider().getContractArtifact(id);
    const tree = await PrivateFunctionsTree.create(artifact);
    const privateFunctionsRoot = await tree.getFunctionTreeRoot();

    const publicFunctions: PublicFunction[] = [];
    if (contractClass!.packedBytecode.length > 0) {
      publicFunctions.push({
        selector: FunctionSelector.fromField(new Fr(PUBLIC_DISPATCH_SELECTOR)),
        bytecode: contractClass!.packedBytecode,
      });
    }

    return {
      id,
      artifactHash: contractClass!.artifactHash,
      packedBytecode: contractClass!.packedBytecode,
      publicFunctions: publicFunctions,
      privateFunctionsRoot: new Fr(privateFunctionsRoot!.root),
      version: contractClass!.version,
      privateFunctions: [],
      unconstrainedFunctions: [],
    };
  }

  async getBytecodeCommitment(id: Fr): Promise<Fr | undefined> {
    const contractClass = await this.txeOracle.getContractDataProvider().getContractClass(id);
    return computePublicBytecodeCommitment(contractClass.packedBytecode);
  }

  async getContract(address: AztecAddress): Promise<ContractInstanceWithAddress | undefined> {
    const instance = await this.txeOracle.getContractDataProvider().getContractInstance(address);
    return { ...instance, address };
  }

  getContractClassIds(): Promise<Fr[]> {
    throw new Error('Method not implemented.');
  }

  async getContractArtifact(address: AztecAddress): Promise<ContractArtifact | undefined> {
    const instance = await this.txeOracle.getContractDataProvider().getContractInstance(address);
    return this.txeOracle.getContractDataProvider().getContractArtifact(instance.currentContractClassId);
  }

  async getContractFunctionName(address: AztecAddress, selector: FunctionSelector): Promise<string | undefined> {
    const artifact = await this.getContractArtifact(address);
    if (!artifact) {
      return undefined;
    }
    const functionSelectorsAndNames = await Promise.all(
      artifact.functions.map(async f => ({
        name: f.name,
        selector: await FunctionSelector.fromNameAndParameters({ name: f.name, parameters: f.parameters }),
      })),
    );
    const func = functionSelectorsAndNames.find(f => f.selector.equals(selector));

    return Promise.resolve(func?.name);
  }

  registerContractFunctionSignatures(_address: AztecAddress, _signatures: []): Promise<void> {
    return Promise.resolve();
  }
}
