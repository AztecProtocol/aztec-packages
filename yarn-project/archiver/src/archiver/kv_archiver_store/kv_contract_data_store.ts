import type { Fr } from '@aztec/foundation/fields';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type {
  ContractClassPublic,
  ContractInstanceUpdateWithAddress,
  ContractInstanceWithAddress,
  ExecutablePrivateFunctionWithMembershipProof,
  UtilityFunctionWithMembershipProof,
} from '@aztec/stdlib/contract';
import type { UInt64 } from '@aztec/stdlib/types';

import { ContractClassStore } from './contract_class_store.js';
import type { ContractDataStore } from './contract_data_store.js';
import { ContractInstanceStore } from './contract_instance_store.js';

/**
 * TypeScript LMDB implementation of ContractDataStore.
 * This wraps the existing ContractClassStore and ContractInstanceStore.
 */
export class KVContractDataStore implements ContractDataStore {
  #contractClassStore: ContractClassStore;
  #contractInstanceStore: ContractInstanceStore;

  constructor(private db: AztecAsyncKVStore) {
    this.#contractClassStore = new ContractClassStore(db);
    this.#contractInstanceStore = new ContractInstanceStore(db);
  }

  getContractClass(id: Fr): Promise<ContractClassPublic | undefined> {
    return this.#contractClassStore.getContractClass(id);
  }

  getContractClassIds(): Promise<Fr[]> {
    return this.#contractClassStore.getContractClassIds();
  }

  async addContractClasses(
    data: ContractClassPublic[],
    bytecodeCommitments: Fr[],
    blockNumber: number,
  ): Promise<boolean> {
    return (
      await Promise.all(
        data.map((c, i) => this.#contractClassStore.addContractClass(c, bytecodeCommitments[i], blockNumber)),
      )
    ).every(Boolean);
  }

  async deleteContractClasses(data: ContractClassPublic[], blockNumber: number): Promise<boolean> {
    return (await Promise.all(data.map(c => this.#contractClassStore.deleteContractClasses(c, blockNumber)))).every(
      Boolean,
    );
  }

  getBytecodeCommitment(contractClassId: Fr): Promise<Fr | undefined> {
    return this.#contractClassStore.getBytecodeCommitment(contractClassId);
  }

  addFunctions(
    contractClassId: Fr,
    privateFunctions: ExecutablePrivateFunctionWithMembershipProof[],
    utilityFunctions: UtilityFunctionWithMembershipProof[],
  ): Promise<boolean> {
    return this.#contractClassStore.addFunctions(contractClassId, privateFunctions, utilityFunctions);
  }

  getContractInstance(address: AztecAddress, timestamp: UInt64): Promise<ContractInstanceWithAddress | undefined> {
    return this.#contractInstanceStore.getContractInstance(address, timestamp);
  }

  getContractInstanceDeploymentBlockNumber(address: AztecAddress): Promise<number | undefined> {
    return this.#contractInstanceStore.getContractInstanceDeploymentBlockNumber(address);
  }

  async addContractInstances(data: ContractInstanceWithAddress[], blockNumber: number): Promise<boolean> {
    return (await Promise.all(data.map(c => this.#contractInstanceStore.addContractInstance(c, blockNumber)))).every(
      Boolean,
    );
  }

  async deleteContractInstances(data: ContractInstanceWithAddress[], _blockNumber: number): Promise<boolean> {
    return (await Promise.all(data.map(c => this.#contractInstanceStore.deleteContractInstance(c)))).every(Boolean);
  }

  async addContractInstanceUpdates(data: ContractInstanceUpdateWithAddress[], timestamp: UInt64): Promise<boolean> {
    return (
      await Promise.all(
        data.map((update, logIndex) =>
          this.#contractInstanceStore.addContractInstanceUpdate(update, timestamp, logIndex),
        ),
      )
    ).every(Boolean);
  }

  async deleteContractInstanceUpdates(data: ContractInstanceUpdateWithAddress[], timestamp: UInt64): Promise<boolean> {
    return (
      await Promise.all(
        data.map((update, logIndex) =>
          this.#contractInstanceStore.deleteContractInstanceUpdate(update, timestamp, logIndex),
        ),
      )
    ).every(Boolean);
  }

  transactionAsync<T>(callback: () => Promise<T>): Promise<T> {
    return this.db.transactionAsync(callback);
  }

  close(): Promise<void> {
    // DB is owned by KVArchiverDataStore, so we don't close it here
    return Promise.resolve();
  }
}
