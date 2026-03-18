import type { Fr } from '@aztec/foundation/curves/bn254';
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

/** Duplicates key components in the value because LMDB can't deserialize tuple keys during iteration. */
type PrunedUpdateEntry = { blockNumber: number; address: string; timestamp: string; logIndex: number };

/**
 * LMDB-based contract instance storage for the archiver.
 */
export class ContractInstanceStore {
  #contractInstances: AztecAsyncMap<string, Buffer>;
  #contractInstancePublishedAt: AztecAsyncMap<string, number>;
  #contractInstanceUpdates: AztecAsyncMap<ContractInstanceUpdateKey, Buffer>;
  #prunedContractInstances: AztecAsyncMap<string, number>;
  #prunedContractInstanceUpdates: AztecAsyncMap<ContractInstanceUpdateKey, PrunedUpdateEntry>;

  constructor(private db: AztecAsyncKVStore) {
    this.#contractInstances = db.openMap('archiver_contract_instances');
    this.#contractInstancePublishedAt = db.openMap('archiver_contract_instances_publication_block_number');
    this.#contractInstanceUpdates = db.openMap('archiver_contract_instance_updates');
    this.#prunedContractInstances = db.openMap('archiver_pruned_contract_instances');
    this.#prunedContractInstanceUpdates = db.openMap('archiver_pruned_contract_instance_updates');
  }

  addContractInstance(contractInstance: ContractInstanceWithAddress, blockNumber: number): Promise<void> {
    return this.db.transactionAsync(async () => {
      await this.#contractInstances.set(
        contractInstance.address.toString(),
        new SerializableContractInstance(contractInstance).toBuffer(),
      );
      await this.#contractInstancePublishedAt.set(contractInstance.address.toString(), blockNumber);
      // If previously pruned, remove from pending-deletion map so finalization won't hard-delete it
      await this.#prunedContractInstances.delete(contractInstance.address.toString());
    });
  }

  deleteContractInstance(contractInstance: ContractInstanceWithAddress): Promise<boolean> {
    return this.db.transactionAsync(async () => {
      const publishedAt = await this.#contractInstancePublishedAt.getAsync(contractInstance.address.toString());
      if (publishedAt !== undefined) {
        await this.#prunedContractInstances.set(contractInstance.address.toString(), publishedAt);
      }
      return true;
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
    const key = this.getUpdateKey(contractInstanceUpdate.address, timestamp, logIndex);
    return this.db.transactionAsync(async () => {
      await this.#contractInstanceUpdates.set(
        key,
        new SerializableContractInstanceUpdate(contractInstanceUpdate).toBuffer(),
      );
      await this.#prunedContractInstanceUpdates.delete(key);
    });
  }

  async deleteContractInstanceUpdate(
    contractInstanceUpdate: ContractInstanceUpdateWithAddress,
    timestamp: UInt64,
    logIndex: number,
    blockNumber: number,
  ): Promise<boolean> {
    const key = this.getUpdateKey(contractInstanceUpdate.address, timestamp, logIndex);
    const entry: PrunedUpdateEntry = {
      blockNumber,
      address: contractInstanceUpdate.address.toString(),
      timestamp: timestamp.toString(),
      logIndex,
    };
    await this.#prunedContractInstanceUpdates.set(key, entry);
    return true;
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
    return this.#contractInstancePublishedAt.getAsync(address.toString());
  }

  /**
   * Hard-deletes pruned contract data for blocks at or before the finalized block number.
   * Called when a checkpoint is finalized, at which point no in-flight fork can reference the pruned data.
   */
  async finalizeContractData(finalizedBlockNumber: number): Promise<void> {
    await this.db.transactionAsync(async () => {
      // Hard-delete pruned contract instances
      for await (const [address, publishedAt] of this.#prunedContractInstances.entriesAsync()) {
        if (publishedAt <= finalizedBlockNumber) {
          await this.#contractInstances.delete(address);
          await this.#contractInstancePublishedAt.delete(address);
          await this.#prunedContractInstances.delete(address);
        }
      }

      for await (const entry of this.#prunedContractInstanceUpdates.valuesAsync()) {
        if (entry.blockNumber <= finalizedBlockNumber) {
          const key: ContractInstanceUpdateKey = [entry.address, entry.timestamp, entry.logIndex];
          await this.#contractInstanceUpdates.delete(key);
          await this.#prunedContractInstanceUpdates.delete(key);
        }
      }
    });
  }
}
