import type { Fr } from '@aztec/foundation/fields';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type {
  ContractClassPublic,
  ContractInstanceUpdateWithAddress,
  ContractInstanceWithAddress,
  ExecutablePrivateFunctionWithMembershipProof,
  UtilityFunctionWithMembershipProof,
} from '@aztec/stdlib/contract';
import type { UInt64 } from '@aztec/stdlib/types';

/**
 * Interface for contract storage.
 */
export interface ContractDataStore {
  // Contract Classes
  getContractClass(id: Fr): Promise<ContractClassPublic | undefined>;
  getContractClassIds(): Promise<Fr[]>;
  addContractClasses(data: ContractClassPublic[], bytecodeCommitments: Fr[], blockNumber: number): Promise<boolean>;
  deleteContractClasses(data: ContractClassPublic[], blockNumber: number): Promise<boolean>;
  getBytecodeCommitment(contractClassId: Fr): Promise<Fr | undefined>;
  addFunctions(
    contractClassId: Fr,
    privateFunctions: ExecutablePrivateFunctionWithMembershipProof[],
    utilityFunctions: UtilityFunctionWithMembershipProof[],
  ): Promise<boolean>;

  // Contract Instances
  getContractInstance(address: AztecAddress, timestamp: UInt64): Promise<ContractInstanceWithAddress | undefined>;
  getContractInstanceDeploymentBlockNumber(address: AztecAddress): Promise<number | undefined>;
  addContractInstances(data: ContractInstanceWithAddress[], blockNumber: number): Promise<boolean>;
  deleteContractInstances(data: ContractInstanceWithAddress[], blockNumber: number): Promise<boolean>;
  addContractInstanceUpdates(data: ContractInstanceUpdateWithAddress[], timestamp: UInt64): Promise<boolean>;
  deleteContractInstanceUpdates(data: ContractInstanceUpdateWithAddress[], timestamp: UInt64): Promise<boolean>;

  // Transactions
  transactionAsync<T>(callback: () => Promise<T>): Promise<T>;

  // Lifecycle
  close(): Promise<void>;
}
