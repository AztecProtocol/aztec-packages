import type { Fr } from '@aztec/foundation/fields';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  type ContractInstanceUpdateWithAddress,
  type ContractInstanceWithAddress,
  SerializableContractInstance,
  SerializableContractInstanceUpdate,
} from '@aztec/stdlib/contract';
import type { UInt64 } from '@aztec/stdlib/types';

type ContractInstanceUpdateKey = [string, string] | [string, string, number];

/**
 * LMDB implementation of the ArchiverDataStore interface.
 */
export class ContractInstanceStore {
  #contractInstances: AztecAsyncMap<string, Buffer>;
  #contractInstanceDeployedAt: AztecAsyncMap<string, number>;
  #contractInstanceUpdates: AztecAsyncMap<ContractInstanceUpdateKey, Buffer>;

  constructor(private db: AztecAsyncKVStore) {
    this.#contractInstances = db.openMap('archiver_contract_instances');
    this.#contractInstanceDeployedAt = db.openMap('archiver_contract_instances_deployment_block_number');
    this.#contractInstanceUpdates = db.openMap('archiver_contract_instance_updates');
  }

  addContractInstance(contractInstance: ContractInstanceWithAddress, blockNumber: number): Promise<void> {
    return this.db.transactionAsync(async () => {
      await this.#contractInstances.set(
        contractInstance.address.toString(),
        new SerializableContractInstance(contractInstance).toBuffer(),
      );
      await this.#contractInstanceDeployedAt.set(contractInstance.address.toString(), blockNumber);
    });
  }

  deleteContractInstance(contractInstance: ContractInstanceWithAddress): Promise<void> {
    return this.db.transactionAsync(async () => {
      await this.#contractInstances.delete(contractInstance.address.toString());
      await this.#contractInstanceDeployedAt.delete(contractInstance.address.toString());
    });
  }

  getUpdateKey(contractAddress: AztecAddress, timestamp: UInt64, logIndex?: number): ContractInstanceUpdateKey {
    if (logIndex === undefined) {
      return [contractAddress.toString(), timestamp.toString()];
    } else {
      return [contractAddress.toString(), timestamp.toString(), logIndex];
    }
  }

  addContractInstanceUpdate(
    contractInstanceUpdate: ContractInstanceUpdateWithAddress,
    timestamp: UInt64,
    logIndex: number,
  ): Promise<void> {
    return this.#contractInstanceUpdates.set(
      this.getUpdateKey(contractInstanceUpdate.address, timestamp, logIndex),
      new SerializableContractInstanceUpdate(contractInstanceUpdate).toBuffer(),
    );
  }

  deleteContractInstanceUpdate(
    contractInstanceUpdate: ContractInstanceUpdateWithAddress,
    timestamp: UInt64,
    logIndex: number,
  ): Promise<void> {
    return this.#contractInstanceUpdates.delete(this.getUpdateKey(contractInstanceUpdate.address, timestamp, logIndex));
  }

  async getCurrentContractInstanceClassId(address: AztecAddress, timestamp: UInt64, originalClassId: Fr): Promise<Fr> {
    // We need to find the last update before the given timestamp
    const queryResult = await this.#contractInstanceUpdates
      .valuesAsync({
        reverse: true,
        start: this.getUpdateKey(address, 0n), // Make sure we only look at updates for this contract
        end: this.getUpdateKey(address, timestamp + 1n), // No update can match this key since it doesn't have a log index. We want the highest key <= timestamp
        limit: 1,
      })
      .next();
    if (queryResult.done) {
      return originalClassId;
    }

    const serializedUpdate = queryResult.value;
    const update = SerializableContractInstanceUpdate.fromBuffer(serializedUpdate);
    if (timestamp < update.timestampOfChange) {
      return update.prevContractClassId.isZero() ? originalClassId : update.prevContractClassId;
    }
    return update.newContractClassId;
  }

  async getContractInstance(
    address: AztecAddress,
    timestamp: UInt64,
  ): Promise<ContractInstanceWithAddress | undefined> {
    const contractInstance = await this.#contractInstances.getAsync(address.toString());
    if (!contractInstance) {
      return undefined;
    }

    const instance = SerializableContractInstance.fromBuffer(contractInstance).withAddress(address);
    instance.currentContractClassId = await this.getCurrentContractInstanceClassId(
      address,
      timestamp,
      instance.originalContractClassId,
    );
    return instance;
  }

  getContractInstanceDeploymentBlockNumber(address: AztecAddress): Promise<number | undefined> {
    return this.#contractInstanceDeployedAt.getAsync(address.toString());
  }
}
