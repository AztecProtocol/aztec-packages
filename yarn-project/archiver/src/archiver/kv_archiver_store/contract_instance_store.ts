import type { Fr } from '@aztec/foundation/fields';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  type ContractInstanceUpdateWithAddress,
  type ContractInstanceWithAddress,
  SerializableContractInstance,
  SerializableContractInstanceUpdate,
} from '@aztec/stdlib/contract';

type ContractInstanceUpdateKey = [string, number] | [string, number, number];

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

  getUpdateKey(contractAddress: AztecAddress, blockNumber: number, logIndex?: number): ContractInstanceUpdateKey {
    if (logIndex === undefined) {
      return [contractAddress.toString(), blockNumber];
    } else {
      return [contractAddress.toString(), blockNumber, logIndex];
    }
  }

  addContractInstanceUpdate(
    contractInstanceUpdate: ContractInstanceUpdateWithAddress,
    blockNumber: number,
    logIndex: number,
  ): Promise<void> {
    return this.#contractInstanceUpdates.set(
      this.getUpdateKey(contractInstanceUpdate.address, blockNumber, logIndex),
      new SerializableContractInstanceUpdate(contractInstanceUpdate).toBuffer(),
    );
  }

  deleteContractInstanceUpdate(
    contractInstanceUpdate: ContractInstanceUpdateWithAddress,
    blockNumber: number,
    logIndex: number,
  ): Promise<void> {
    return this.#contractInstanceUpdates.delete(
      this.getUpdateKey(contractInstanceUpdate.address, blockNumber, logIndex),
    );
  }

  async getCurrentContractInstanceClassId(
    address: AztecAddress,
    blockNumber: number,
    originalClassId: Fr,
  ): Promise<Fr> {
    // We need to find the last update before the given block number
    const queryResult = await this.#contractInstanceUpdates
      .valuesAsync({
        reverse: true,
        start: this.getUpdateKey(address, 0), // Make sure we only look at updates for this contract
        end: this.getUpdateKey(address, blockNumber + 1), // No update can match this key since it doesn't have a log index. We want the highest key <= blockNumber
        limit: 1,
      })
      .next();
    if (queryResult.done) {
      return originalClassId;
    }

    const serializedUpdate = queryResult.value;
    const update = SerializableContractInstanceUpdate.fromBuffer(serializedUpdate);
    if (blockNumber < update.blockOfChange) {
      return update.prevContractClassId.isZero() ? originalClassId : update.prevContractClassId;
    }
    return update.newContractClassId;
  }

  async getContractInstance(
    address: AztecAddress,
    blockNumber: number,
  ): Promise<ContractInstanceWithAddress | undefined> {
    const contractInstance = await this.#contractInstances.getAsync(address.toString());
    if (!contractInstance) {
      return undefined;
    }

    const instance = SerializableContractInstance.fromBuffer(contractInstance).withAddress(address);
    instance.currentContractClassId = await this.getCurrentContractInstanceClassId(
      address,
      blockNumber,
      instance.originalContractClassId,
    );
    return instance;
  }

  getContractInstanceDeploymentBlockNumber(address: AztecAddress): Promise<number | undefined> {
    return this.#contractInstanceDeployedAt.getAsync(address.toString());
  }
}
