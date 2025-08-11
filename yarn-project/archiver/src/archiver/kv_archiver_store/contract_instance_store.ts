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

type ContractInstanceUpdateKey = [string, string] | [string, string, string];

// Fixed-width paddings to preserve numeric ordering when keys are serialized as strings
const U64_DECIMAL_WIDTH = 20; // max 18446744073709551615
const LOG_INDEX_WIDTH = 10; // supports up to 9,999,999,999 entries per timestamp

function padUInt64Decimal(value: bigint): string {
  return value.toString().padStart(U64_DECIMAL_WIDTH, '0');
}

function padLogIndex(value: number): string {
  return value.toString().padStart(LOG_INDEX_WIDTH, '0');
}

/**
 * LMDB implementation of the ArchiverDataStore interface.
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

  addContractInstance(contractInstance: ContractInstanceWithAddress, blockNumber: number): Promise<void> {
    return this.db.transactionAsync(async () => {
      await this.#contractInstances.set(
        contractInstance.address.toString(),
        new SerializableContractInstance(contractInstance).toBuffer(),
      );
      await this.#contractInstancePublishedAt.set(contractInstance.address.toString(), blockNumber);
    });
  }

  deleteContractInstance(contractInstance: ContractInstanceWithAddress): Promise<void> {
    return this.db.transactionAsync(async () => {
      await this.#contractInstances.delete(contractInstance.address.toString());
      await this.#contractInstancePublishedAt.delete(contractInstance.address.toString());
    });
  }

  getUpdateKey(contractAddress: AztecAddress, timestamp: UInt64, logIndex?: number): ContractInstanceUpdateKey {
    const ts = padUInt64Decimal(timestamp);
    if (logIndex === undefined) {
      return [contractAddress.toString(), ts];
    } else {
      return [contractAddress.toString(), ts, padLogIndex(logIndex)];
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
