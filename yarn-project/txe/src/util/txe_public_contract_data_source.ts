import { AztecAddress, Fr, FunctionSelector, unpackBytecode } from '@aztec/circuits.js';
import { ContractArtifact } from '@aztec/foundation/abi';
import { PrivateFunctionsTree } from '@aztec/pxe';
import {
  ContractClassPublic,
  ContractDataSource,
  ContractInstanceWithAddress,
  PublicFunction,
} from '@aztec/types/contracts';

import { TXE } from '../oracle/txe_oracle.js';

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
    let contractClass;
    let privateFunctionsRoot;
    try {
      contractClass = await this.txeOracle.getContractDataOracle().getContractClass(id);
      const artifact = await this.txeOracle.getContractDataOracle().getContractArtifact(id);
      const tree = new PrivateFunctionsTree(artifact);
      privateFunctionsRoot = await tree.getFunctionTreeRoot();
    } catch {}

    return {
      id,
      artifactHash: contractClass!.artifactHash,
      packedBytecode: contractClass!.packedBytecode,
      publicFunctions: unpackBytecode(contractClass!.packedBytecode),
      privateFunctionsRoot: new Fr(privateFunctionsRoot!.root),
      version: contractClass!.version,
      privateFunctions: [],
      unconstrainedFunctions: [],
    };
  }

  async getContract(address: AztecAddress): Promise<ContractInstanceWithAddress | undefined> {
    const instance = await this.txeOracle.getContractDataOracle().getContractInstance(address);
    return { ...instance, address };
  }

  getContractClassIds(): Promise<Fr[]> {
    throw new Error('Method not implemented.');
  }

  getContractArtifact(address: AztecAddress): Promise<ContractArtifact | undefined> {
    return this.txeOracle.getContractDataOracle().getContractArtifact(address);
  }

  addContractArtifact(address: AztecAddress, contract: ContractArtifact): Promise<void> {
    return this.txeOracle.addContractArtifact(contract);
  }
}
