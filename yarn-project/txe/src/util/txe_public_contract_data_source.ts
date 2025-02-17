import {
  type AztecAddress,
  type ContractClassPublic,
  type ContractDataSource,
  type ContractInstanceWithAddress,
  Fr,
  FunctionSelector,
  PUBLIC_DISPATCH_SELECTOR,
  type PublicFunction,
  computePublicBytecodeCommitment,
} from '@aztec/circuits.js';
import { type ContractArtifact } from '@aztec/foundation/abi';
import { PrivateFunctionsTree } from '@aztec/pxe';

import { type TXE } from '../oracle/txe_oracle.js';

export class TXEPublicContractDataSource implements ContractDataSource {
  constructor(private txeOracle: TXE) {}

  async getPublicFunction(address: AztecAddress, selector: FunctionSelector): Promise<PublicFunction | undefined> {
    const bytecode = await this.txeOracle.getContractDataOracle().getBytecode(address, selector);
    if (!bytecode) {
      return undefined;
    }
    return { bytecode, selector };
  }

  getBlockNumber(): Promise<number> {
    return this.txeOracle.getBlockNumber();
  }

  async getContractClass(id: Fr): Promise<ContractClassPublic | undefined> {
    const contractClass = await this.txeOracle.getContractDataOracle().getContractClass(id);
    const artifact = await this.txeOracle.getContractDataOracle().getContractArtifact(id);
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
    const contractClass = await this.txeOracle.getContractDataOracle().getContractClass(id);
    return computePublicBytecodeCommitment(contractClass.packedBytecode);
  }

  async getContract(address: AztecAddress): Promise<ContractInstanceWithAddress | undefined> {
    const instance = await this.txeOracle.getContractDataOracle().getContractInstance(address);
    return { ...instance, address };
  }

  getContractClassIds(): Promise<Fr[]> {
    throw new Error('Method not implemented.');
  }

  async getContractArtifact(address: AztecAddress): Promise<ContractArtifact | undefined> {
    const instance = await this.txeOracle.getContractDataOracle().getContractInstance(address);
    return this.txeOracle.getContractDataOracle().getContractArtifact(instance.currentContractClassId);
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

  // TODO(#10007): Remove this method.
  addContractClass(_contractClass: ContractClassPublic): Promise<void> {
    // We don't really need to do anything for the txe here
    return Promise.resolve();
  }
}
