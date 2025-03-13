import type { Fr } from '@aztec/foundation/fields';
import type { FunctionSelector } from '@aztec/stdlib/abi';
import {
  AvmBytecodeCommitmentHint,
  AvmContractClassHint,
  AvmContractInstanceHint,
  type AvmExecutionHints,
} from '@aztec/stdlib/avm';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractClassPublic, ContractInstanceWithAddress } from '@aztec/stdlib/contract';

import type { PublicContractsDBInterface } from '../server.js';

/**
 * A public contracts database that forwards requests and collects AVM hints.
 */
export class HintingPublicContractsDB implements PublicContractsDBInterface {
  constructor(private readonly db: PublicContractsDBInterface, public readonly hints: AvmExecutionHints) {}

  public async getContractInstance(
    address: AztecAddress,
    blockNumber: number,
  ): Promise<ContractInstanceWithAddress | undefined> {
    const instance = await this.db.getContractInstance(address, blockNumber);
    if (instance) {
      // We don't need to hint the block number because it doesn't change.
      this.hints.contractInstances.push(
        new AvmContractInstanceHint(
          instance.address,
          instance.salt,
          instance.deployer,
          instance.currentContractClassId,
          instance.originalContractClassId,
          instance.initializationHash,
          instance.publicKeys,
        ),
      );
    }
    return instance;
  }

  public async getContractClass(contractClassId: Fr): Promise<ContractClassPublic | undefined> {
    const contractClass = await this.db.getContractClass(contractClassId);
    if (contractClass) {
      this.hints.contractClasses.push(
        new AvmContractClassHint(
          contractClass.id,
          contractClass.artifactHash,
          contractClass.privateFunctionsRoot,
          contractClass.packedBytecode,
        ),
      );
    }
    return contractClass;
  }

  public async getBytecodeCommitment(contractClassId: Fr): Promise<Fr | undefined> {
    const commitment = await this.db.getBytecodeCommitment(contractClassId);
    if (commitment) {
      this.hints.bytecodeCommitments.push(new AvmBytecodeCommitmentHint(contractClassId, commitment));
    }
    return commitment;
  }

  public async getDebugFunctionName(
    contractAddress: AztecAddress,
    selector: FunctionSelector,
  ): Promise<string | undefined> {
    return await this.db.getDebugFunctionName(contractAddress, selector);
  }
}
