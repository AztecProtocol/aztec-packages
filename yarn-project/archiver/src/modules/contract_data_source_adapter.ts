import type { BlockNumber } from '@aztec/foundation/branded-types';
import type { Fr } from '@aztec/foundation/curves/bn254';
import type { FunctionSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractClassPublic, ContractDataSource, ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import type { UInt64 } from '@aztec/stdlib/types';

import type { ArchiverDataStores } from '../store/data_stores.js';

/**
 * Thin {@link ContractDataSource} adapter over {@link ArchiverDataStores}.
 *
 * Used by contexts (e.g. offline epoch re-prover tools) that need a ContractDataSource
 * but do not need a full archiver instance.
 */
export class ArchiverContractDataSourceAdapter implements ContractDataSource {
  constructor(private readonly stores: ArchiverDataStores) {}

  public getBlockNumber(): Promise<BlockNumber> {
    return this.stores.blocks.getLatestL2BlockNumber();
  }

  public getContractClass(id: Fr): Promise<ContractClassPublic | undefined> {
    return this.stores.contractClasses.getContractClass(id);
  }

  public getBytecodeCommitment(id: Fr): Promise<Fr | undefined> {
    return this.stores.contractClasses.getBytecodeCommitment(id);
  }

  public getContract(address: AztecAddress, timestamp: UInt64): Promise<ContractInstanceWithAddress | undefined> {
    return this.stores.contractInstances.getContractInstance(address, timestamp);
  }

  public getContractClassIds(): Promise<Fr[]> {
    return this.stores.contractClasses.getContractClassIds();
  }

  public getDebugFunctionName(_address: AztecAddress, selector: FunctionSelector): Promise<string | undefined> {
    return Promise.resolve(this.stores.functionNames.get(selector));
  }

  public registerContractFunctionSignatures(signatures: string[]): Promise<void> {
    return this.stores.functionNames.register(signatures);
  }
}
