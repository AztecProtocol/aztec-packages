import type { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import { isProtocolContract } from '@aztec/protocol-contracts';
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
 * LMDB-based contract instance storage for the archiver.
 */
export class ContractInstanceStore {
  #contractInstances: AztecAsyncMap<string, Buffer>;
  #contractInstancePublishedAt: AztecAsyncMap<string, number>;
  #contractInstanceUpdates: AztecAsyncMap<ContractInstanceUpdateKey, Buffer>;

  constructor(private db: AztecAsyncKVStore) {
    this.#contractInstances = db.openMap('archiver_contract_instances');
    this.#contractInstancePublishedAt = db.openMap('archiver_contract_instances_publication_block_number');
    this.#contractInstanceUpdates = db.openMap('archiver_contract_instance_updates');
  }

  /**
   * Adds multiple contract instances to the store.
   * @param data - Contract instances to add.
   * @param blockNumber - L2 block number where the instances were deployed.
   * @returns True if every insert succeeded.
   */
  async addContractInstances(data: ContractInstanceWithAddress[], blockNumber: number): Promise<boolean> {
    return (await Promise.all(data.map(c => this.addContractInstance(c, blockNumber)))).every(Boolean);
  }

  /**
   * Removes multiple contract instances from the store.
   * @param data - Contract instances to delete.
   * @returns True if every delete succeeded.
   */
  async deleteContractInstances(data: ContractInstanceWithAddress[]): Promise<boolean> {
    return (await Promise.all(data.map(c => this.deleteContractInstance(c)))).every(Boolean);
  }

  /**
   * Adds multiple contract instance updates to the store.
   * @param data - Contract instance updates to add.
   * @param timestamp - Timestamp at which the updates were scheduled.
   * @returns True if every insert succeeded.
   */
  async addContractInstanceUpdates(data: ContractInstanceUpdateWithAddress[], timestamp: UInt64): Promise<boolean> {
    return (
      await Promise.all(data.map((update, logIndex) => this.addContractInstanceUpdate(update, timestamp, logIndex)))
    ).every(Boolean);
  }

  /**
   * Removes multiple contract instance updates from the store.
   * @param data - Contract instance updates to delete.
   * @param timestamp - Timestamp at which the updates were scheduled.
   * @returns True if every delete succeeded.
   */
  async deleteContractInstanceUpdates(data: ContractInstanceUpdateWithAddress[], timestamp: UInt64): Promise<boolean> {
    return (
      await Promise.all(data.map((update, logIndex) => this.deleteContractInstanceUpdate(update, timestamp, logIndex)))
    ).every(Boolean);
  }

  addContractInstance(contractInstance: ContractInstanceWithAddress, blockNumber: number): Promise<void> {
    return this.db.transactionAsync(async () => {
      const key = contractInstance.address.toString();
      if (await this.#contractInstances.hasAsync(key)) {
        // Protocol contracts are preloaded at block 0, so a later on-chain (re-)publish of a bundled
        // protocol instance is valid and must be a no-op. Keep the existing block-0 entry untouched.
        if (isProtocolContract(contractInstance.address)) {
          return;
        }
        throw new Error(
          `Contract instance at ${key} already exists (deployed at block ${await this.#contractInstancePublishedAt.getAsync(key)}), cannot add again at block ${blockNumber}`,
        );
      }
      await this.#contractInstances.set(key, new SerializableContractInstance(contractInstance).toBuffer());
      await this.#contractInstancePublishedAt.set(key, blockNumber);
    });
  }

  deleteContractInstance(contractInstance: ContractInstanceWithAddress): Promise<void> {
    // Protocol contracts are preloaded at block 0 and must never be deleted, even when the block that
    // (re-)published them on-chain is unwound by a reorg.
    if (isProtocolContract(contractInstance.address)) {
      return Promise.resolve();
    }
    return this.db.transactionAsync(async () => {
      await this.#contractInstances.delete(contractInstance.address.toString());
      await this.#contractInstancePublishedAt.delete(contractInstance.address.toString());
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
    return this.#contractInstancePublishedAt.getAsync(address.toString());
  }
}
