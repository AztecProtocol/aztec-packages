import { Fr } from '@aztec/foundation/fields';

import type { PublicStateDB } from '../../index.js';

export class PublicStorage {
  private readonly hostPublicStorage: PublicStateDB;
  private readonly parentStorage: PendingStorage | undefined;
  private pendingStorage: PendingStorage;

  constructor(hostPublicStorage: PublicStateDB, parent?: PublicStorage) {
    this.hostPublicStorage = hostPublicStorage;
    this.parentStorage = parent?.pendingStorage;
    this.pendingStorage = new PendingStorage();
  }

  public getPendingStorage() {
    return this.pendingStorage;
  }

  public acceptAndMerge(otherPublicStorage: PublicStorage) {
    this.pendingStorage.acceptAndMerge(otherPublicStorage.pendingStorage);
  }

  public async read(storageAddress: Fr, slot: Fr): Promise<[/*exists=*/ boolean, /*value=*/ Fr]> {
    // First try check this storage cache
    let value = this.pendingStorage.read(storageAddress, slot);
    // Then try parent's storage cache (if it exists / written to earlier in this TX)
    if (!value && this.parentStorage) {
      value = this.parentStorage?.read(storageAddress, slot);
    }
    // Finally try the host's Aztec state (a trip to the database)
    if (!value) {
      value = await this.hostPublicStorage.storageRead(storageAddress, slot);
    }
    // if value is undefined, that means this slot has never been written to!
    const exists = value !== undefined;
    const valueOrZero = exists ? value : Fr.ZERO;
    return Promise.resolve([exists, valueOrZero]);
  }

  public write(storageAddress: Fr, key: Fr, value: Fr) {
    this.pendingStorage.write(storageAddress, key, value);
  }
}

export class PendingStorage {
  private storage: Map<bigint, Map<bigint, Fr>> = new Map();

  public getNumberContractsTracked() {
    return this.storage.size;
  }

  public getNumberPendingWrites(storageAddress: Fr) {
    return this.storage.get(storageAddress.toBigInt())?.size ?? 0;
  }

  public read(storageAddress: Fr, slot: Fr): Fr | undefined {
    return this.storage.get(storageAddress.toBigInt())?.get(slot.toBigInt());
  }

  public write(storageAddress: Fr, slot: Fr, value: Fr) {
    let storageForContract = this.storage.get(storageAddress.toBigInt());
    // If this contract's storage has no staged modifications, create a new Map to store them
    if (!storageForContract) {
      storageForContract = new Map();
      this.storage.set(storageAddress.toBigInt(), storageForContract);
    }
    storageForContract.set(slot.toBigInt(), value);
  }

  /**
   * Merges a nested/child call's staged public storage modifications
   * into the current/parent.
   *
   * Staged modifications in the child take precedent as they are assumed
   * to occur after the parent's.
   *
   * @param otherPendingStorage - the nested call state to accept storage modifications from
   */
  public acceptAndMerge(otherPendingStorage: PendingStorage) {
    // Iterate over all contracts with staged writes in the child.
    for (const [contractAddress, contractStorageInChild] of otherPendingStorage.storage) {
      const contractStorageInParent = this.storage.get(contractAddress);
      if (!contractStorageInParent) {
        // This contract has no storage writes staged in parent,
        // so just accept the child's storage for this contract as-is.
        this.storage.set(contractAddress, contractStorageInChild);
      } else {
        // Child and parent both have staged writes for this contract.
        // Merge in the child's staged writes.
        for (const [slot, value] of contractStorageInChild) {
          contractStorageInParent.set(slot, value);
        }
      }
    }
  }
}
