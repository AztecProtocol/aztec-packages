import type { Fr } from '@aztec/foundation/fields';
import {
  AvmBytecodeCommitmentHint,
  AvmContractClassHint,
  AvmContractInstanceHint,
  type AvmExecutionHints,
} from '@aztec/stdlib/avm';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractClassPublic, ContractDataSource, ContractInstanceWithAddress } from '@aztec/stdlib/contract';

import { PublicContractsDB } from './public_db_sources.js';

/**
 * A public contracts database that collects AVM hints.
 */
export class HintingPublicContractsDB extends PublicContractsDB {
  constructor(dataSource: ContractDataSource, private hints: AvmExecutionHints) {
    super(dataSource);
  }

  public override async getContractInstance(address: AztecAddress): Promise<ContractInstanceWithAddress | undefined> {
    const instance = await super.getContractInstance(address);
    if (instance) {
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

  public override async getContractClass(contractClassId: Fr): Promise<ContractClassPublic | undefined> {
    const contractClass = await super.getContractClass(contractClassId);
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

  public override async getBytecodeCommitment(contractClassId: Fr): Promise<Fr | undefined> {
    const commitment = await super.getBytecodeCommitment(contractClassId);
    if (commitment) {
      this.hints.bytecodeCommitments.push(new AvmBytecodeCommitmentHint(contractClassId, commitment));
    }
    return commitment;
  }
}
